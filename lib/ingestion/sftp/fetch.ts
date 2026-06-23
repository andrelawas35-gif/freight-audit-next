/*
  lib/ingestion/sftp/fetch.ts — SFTP poller for the Anti-VAN EDI pipeline.

  Connects to carrier SFTP servers, downloads new .edi/.x12/.csv files,
  processes them through the existing ingestion pipeline, and tracks
  processed files to avoid re-ingestion.

  Carrier SFTP credentials are stored as env-var names (not plaintext)
  in the Carriers table. The actual secrets live in Vercel env vars.
*/

import SftpClient from 'ssh2-sftp-client';
import { getSql } from '@/lib/db';
import { parseEdi210 } from '@/lib/ingestion/edi/parser';
import { normalizeEdi210 } from '@/lib/ingestion/carriers/from-edi';
import { parseLtlCsv } from '@/lib/ingestion/carriers/ltl-csv';
import { stageInvoice } from '@/lib/ingestion/normalize';
import {
  loadLearnedMappings,
  createMappingContext,
  persistExceptions,
} from '@/lib/ingestion/mappings';

export type SftpCarrierConfig = {
  scac: string;
  host: string;
  port: number;
  user: string;
  privateKey: string;
  inboxDir: string;
  archiveDir: string | null;
  fileFormat: 'edi' | 'csv';
};

export type SftpFetchSummary = {
  carriersPolled: number;
  filesDownloaded: number;
  invoicesStaged: number;
  errors: string[];
};

export async function loadSftpCarriers(): Promise<SftpCarrierConfig[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT "SCAC", sftp_host, sftp_port, sftp_user, sftp_key_env,
            sftp_inbox_dir, sftp_archive_dir, sftp_file_format
       FROM "Carriers"
      WHERE sftp_enabled = true
        AND sftp_host IS NOT NULL
        AND sftp_user IS NOT NULL
        AND sftp_key_env IS NOT NULL`
  )) as {
    SCAC: string;
    sftp_host: string;
    sftp_port: number | null;
    sftp_user: string;
    sftp_key_env: string;
    sftp_inbox_dir: string | null;
    sftp_archive_dir: string | null;
    sftp_file_format: string | null;
  }[];

  return rows
    .map((r) => {
      const privateKey = process.env[r.sftp_key_env];
      if (!privateKey) return null;
      return {
        scac: r.SCAC.toUpperCase(),
        host: r.sftp_host,
        port: r.sftp_port ?? 22,
        user: r.sftp_user,
        privateKey,
        inboxDir: r.sftp_inbox_dir ?? '/outbound',
        archiveDir: r.sftp_archive_dir,
        fileFormat: (r.sftp_file_format === 'csv' ? 'csv' : 'edi') as 'edi' | 'csv',
      };
    })
    .filter((c): c is SftpCarrierConfig => c !== null);
}

async function isAlreadyProcessed(scac: string, fileName: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT 1 FROM sftp_processed_files
      WHERE carrier_scac = $1 AND file_name = $2
      LIMIT 1`,
    [scac, fileName]
  )) as unknown[];
  return rows.length > 0;
}

async function recordProcessed(
  scac: string,
  fileName: string,
  fileSize: number | null,
  filesStaged: number,
  errors: string[]
): Promise<void> {
  const sql = getSql();
  await sql.query(
    `INSERT INTO sftp_processed_files (carrier_scac, file_name, file_size, files_staged, errors)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (carrier_scac, file_name) DO NOTHING`,
    [scac, fileName, fileSize, filesStaged, errors]
  );
}

const EDI_EXTENSIONS = new Set(['.edi', '.x12', '.210', '.txt']);
const CSV_EXTENSIONS = new Set(['.csv']);

function matchesFormat(fileName: string, format: 'edi' | 'csv'): boolean {
  const lower = fileName.toLowerCase();
  const exts = format === 'csv' ? CSV_EXTENSIONS : EDI_EXTENSIONS;
  return [...exts].some((ext) => lower.endsWith(ext));
}

async function processOneCarrier(
  config: SftpCarrierConfig
): Promise<{ files: number; staged: number; errors: string[] }> {
  const sftp = new SftpClient();
  const errors: string[] = [];
  let filesDownloaded = 0;
  let totalStaged = 0;

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.user,
      privateKey: config.privateKey,
    });

    const listing = await sftp.list(config.inboxDir);
    const candidates = listing.filter(
      (f) => f.type === '-' && matchesFormat(f.name, config.fileFormat)
    );

    const learned = await loadLearnedMappings();

    for (const file of candidates) {
      try {
        if (await isAlreadyProcessed(config.scac, file.name)) continue;

        const remotePath = `${config.inboxDir}/${file.name}`;
        const content = (await sftp.get(remotePath)) as Buffer;
        const text = content.toString('utf-8');
        filesDownloaded++;

        let staged = 0;
        const fileErrors: string[] = [];

        if (config.fileFormat === 'edi') {
          try {
            const ctx = createMappingContext(learned, 'edi');
            const parsed = parseEdi210(text);
            const normalized = normalizeEdi210(parsed, ctx);
            await stageInvoice(normalized);
            staged++;
            await persistExceptions(ctx.exceptions);
          } catch (err) {
            const msg = `EDI parse/stage failed for ${file.name}: ${err}`;
            fileErrors.push(msg);
            errors.push(msg);
          }
        } else {
          try {
            const ctx = createMappingContext(learned, 'csv');
            const invoices = parseLtlCsv(text, { scac: config.scac }, ctx);
            for (const inv of invoices) {
              try {
                await stageInvoice(inv);
                staged++;
              } catch (err) {
                const msg = `CSV stage failed for ${file.name} invoice ${inv.invoiceNumber}: ${err}`;
                fileErrors.push(msg);
                errors.push(msg);
              }
            }
            await persistExceptions(ctx.exceptions);
          } catch (err) {
            const msg = `CSV parse failed for ${file.name}: ${err}`;
            fileErrors.push(msg);
            errors.push(msg);
          }
        }

        await recordProcessed(config.scac, file.name, file.size, staged, fileErrors);
        totalStaged += staged;

        if (config.archiveDir && fileErrors.length === 0) {
          try {
            const archivePath = `${config.archiveDir}/${file.name}`;
            await sftp.rename(remotePath, archivePath);
          } catch {
            // Non-fatal — file stays in inbox but won't be re-processed
          }
        }
      } catch (err) {
        errors.push(`Failed to process ${file.name} from ${config.scac}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`SFTP connection failed for ${config.scac} (${config.host}): ${err}`);
  } finally {
    try { await sftp.end(); } catch { /* ignore */ }
  }

  return { files: filesDownloaded, staged: totalStaged, errors };
}

export async function runSftpFetch(): Promise<SftpFetchSummary> {
  const carriers = await loadSftpCarriers();
  const summary: SftpFetchSummary = {
    carriersPolled: carriers.length,
    filesDownloaded: 0,
    invoicesStaged: 0,
    errors: [],
  };

  for (const config of carriers) {
    const result = await processOneCarrier(config);
    summary.filesDownloaded += result.files;
    summary.invoicesStaged += result.staged;
    summary.errors.push(...result.errors);
  }

  return summary;
}
