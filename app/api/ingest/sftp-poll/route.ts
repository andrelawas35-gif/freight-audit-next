/*
  POST /api/ingest/sftp-poll

  Called by a cron job (Vercel Cron, AWS EventBridge, etc.) to process
  LTL carrier CSV files that have been downloaded from SFTP.

  Body:
    { scac: string, csv: string, columns?: Partial<LtlCsvColumnMap> }
*/

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseLtlCsv }       from '@/lib/ingestion/carriers/ltl-csv';
import { stageInvoice }      from '@/lib/ingestion/normalize';
import type { LtlCsvColumnMap } from '@/lib/ingestion/carriers/ltl-csv';
import { loadLearnedMappings, createMappingContext, persistExceptions } from '@/lib/ingestion/mappings';
import { annotateOpenExceptions } from '@/lib/ingestion/data-clerk';
import { withObservability } from '@/lib/api-handler';

const bodySchema = z.object({
  scac: z.string().min(1, 'scac is required'),
  csv: z.string().min(1, 'csv is required'),
  columns: z.record(z.string(), z.string()).optional(),
});

export const POST = withObservability('ingest/sftp-poll', async (req, { log }) => {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid SFTP poll body', { details: parsed.error.flatten() });
    return NextResponse.json(
      { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { scac, csv, columns } = parsed.data;

  const ctx = createMappingContext(await loadLearnedMappings(), 'csv');
  const invoices = parseLtlCsv(csv, { scac, columns }, ctx);

  const results = await Promise.allSettled(
    invoices.map((inv) => stageInvoice(inv))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected').length;
  const errors    = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason));

  const newExceptions = await persistExceptions(ctx.exceptions);
  if (newExceptions > 0) await annotateOpenExceptions();

  log.info('SFTP poll processed', { scac, total: invoices.length, succeeded, failed, newExceptions });
  return NextResponse.json({ ok: true, invoices: invoices.length, succeeded, failed, errors, newExceptions });
});
