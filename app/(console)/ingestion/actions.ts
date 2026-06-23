'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import { enqueueAudit } from '@/lib/audit/jobs';
import { normalizeFromFedexApi } from '@/lib/ingestion/carriers/fedex-api';
import { normalizeFromUpsApi } from '@/lib/ingestion/carriers/ups-api';
import { parseLtlCsv } from '@/lib/ingestion/carriers/ltl-csv';
import { normalizeFromShipStation } from '@/lib/ingestion/client/shipstation';
import { normalizeFromShopify } from '@/lib/ingestion/client/shopify';
import { parseClientShipmentCsv } from '@/lib/ingestion/client/generic-csv';
import { parseEdi210 } from '@/lib/ingestion/edi/parser';
import { normalizeEdi210 } from '@/lib/ingestion/carriers/from-edi';
import { parseFulfillmentCsv, parseStorageCsv } from '@/lib/ingestion/3pl/parse';
import { stageClientShipment, stageInvoice } from '@/lib/ingestion/normalize';
import { stageFulfillment, stageStorage } from '@/lib/ingestion/3pl/stage';
import { recordUpload } from '@/lib/ingestion/uploads';
import { annotateOpenExceptions } from '@/lib/ingestion/data-clerk';
import { createMappingContext, loadLearnedMappings, persistExceptions } from '@/lib/ingestion/mappings';

export type IntakeResult =
  | {
      ok: true;
      source: string;
      rows: number;
      staged: number;
      skipped: number;
      failed?: number;
      matched?: number;
      unmatched?: number;
      dataHealth?: number;
    }
  | { ok: false; error: string; rows?: number; skipped?: number };

export type ManualIngestResult =
  | { ok: true; message: string; details?: Record<string, unknown> }
  | { ok: false; error: string };

const intakeSchema = z.object({
  source: z.enum(['wms_csv', 'tpl_fulfillment', 'tpl_storage']),
  clientId: z.string().min(1, 'Choose a client.'),
  cycle: z.string().trim().optional(),
  carrierScac: z.string().trim().optional(),
});

const manualSchema = z.object({
  mode: z.enum(['sftp_fetch', 'carrier_api', 'wms_webhook', 'edi_raw', 'ltl_csv']),
  clientId: z.string().trim().optional(),
  source: z.string().trim().optional(),
  carrier: z.string().trim().optional(),
  scac: z.string().trim().optional(),
  body: z.string().trim().optional(),
});

export async function runConsoleIntake(
  _prev: IntakeResult | undefined,
  formData: FormData
): Promise<IntakeResult> {
  const session = await auth();
  if (session?.user?.role !== 'staff') {
    return { ok: false, error: 'Staff access required.' };
  }

  const parsed = intakeSchema.safeParse({
    source: formData.get('source'),
    clientId: formData.get('clientId'),
    cycle: formData.get('cycle') || undefined,
    carrierScac: formData.get('carrierScac') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid intake request.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a CSV file before running intake.' };
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { ok: false, error: 'Only CSV files are supported from the console.' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'File is too large. Maximum size is 10 MB.' };
  }

  let csv: string;
  try {
    csv = await file.text();
  } catch {
    return { ok: false, error: 'Could not read the selected file.' };
  }

  const { source, clientId, cycle, carrierScac } = parsed.data;

  if (source === 'wms_csv') {
    const result = parseClientShipmentCsv(csv, clientId);
    if (result.shipments.length === 0) {
      await recordUpload({
        clientId,
        uploadedBy: session.user.email ?? null,
        fileName: file.name,
        rows: result.rowCount,
        staged: 0,
        skipped: result.skipped,
        failed: 0,
        dataHealth: 0,
        status: 'no_rows',
      });
      revalidateIngestionViews();
      return {
        ok: false,
        error: 'No usable shipment rows found. Each row needs a tracking number or PRO number.',
        rows: result.rowCount,
        skipped: result.skipped,
      };
    }

    let staged = 0;
    let failed = 0;
    for (const shipment of result.shipments) {
      try {
        await stageClientShipment(shipment);
        staged++;
      } catch (err) {
        failed++;
        console.error('console WMS shipment staging failed:', err);
      }
    }

    await recordUpload({
      clientId,
      uploadedBy: session.user.email ?? null,
      fileName: file.name,
      rows: result.rowCount,
      staged,
      skipped: result.skipped,
      failed,
      dataHealth: result.dataHealth,
      status: failed > 0 ? 'partial' : 'ok',
    });

    revalidateIngestionViews();
    return {
      ok: true,
      source,
      rows: result.rowCount,
      staged,
      skipped: result.skipped,
      failed,
      dataHealth: result.dataHealth,
    };
  }

  if (!cycle) {
    return { ok: false, error: 'Cycle is required for 3PL intake.' };
  }

  if (source === 'tpl_storage') {
    const result = parseStorageCsv(csv);
    const stage = await stageStorage({ clientId, cycle, lines: result.lines });
    revalidateIngestionViews();
    return {
      ok: true,
      source,
      rows: result.rowCount,
      staged: stage.staged,
      skipped: result.skipped,
    };
  }

  const result = parseFulfillmentCsv(csv);
  const stage = await stageFulfillment({
    clientId,
    cycle,
    carrierScac: carrierScac ? carrierScac.toUpperCase() : null,
    lines: result.lines,
  });

  revalidateIngestionViews();
  return {
    ok: true,
    source,
    rows: result.rowCount,
    staged: stage.staged,
    skipped: result.skipped,
    matched: stage.matched,
    unmatched: stage.unmatched,
  };
}

export async function runManualIngestion(
  _prev: ManualIngestResult | undefined,
  formData: FormData
): Promise<ManualIngestResult> {
  const session = await auth();
  if (session?.user?.role !== 'staff') {
    return { ok: false, error: 'Staff access required.' };
  }

  const parsed = manualSchema.safeParse({
    mode: formData.get('mode'),
    clientId: formData.get('clientId') || undefined,
    source: formData.get('source') || undefined,
    carrier: formData.get('carrier') || undefined,
    scac: formData.get('scac') || undefined,
    body: formData.get('body') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid manual ingestion request.' };
  }

  const { mode, clientId, source, carrier, scac, body } = parsed.data;

  try {
    if (mode === 'sftp_fetch') {
      const job = await enqueueAudit({
        jobType: 'sftp_fetch',
        triggeredBy: session.user.email ?? 'staff',
      });
      revalidateIngestionViews();
      return {
        ok: true,
        message: `SFTP fetch queued as ${job.id}. The worker will connect using carrier SFTP settings and env credentials.`,
        details: { jobId: job.id, status: job.status },
      };
    }

    if (!body) {
      return { ok: false, error: 'Paste a request body before running this ingestion mode.' };
    }

    if (mode === 'carrier_api') {
      const selectedCarrier = carrier?.toLowerCase();
      if (selectedCarrier !== 'fedex' && selectedCarrier !== 'ups') {
        return { ok: false, error: 'Carrier API mode requires carrier = fedex or ups.' };
      }
      const invoice = parseJsonObject(body, 'carrier invoice JSON');
      const normalized = selectedCarrier === 'fedex'
        ? normalizeFromFedexApi(invoice as any)
        : normalizeFromUpsApi(invoice as any);
      const invoiceId = await stageInvoice(normalized);
      revalidateIngestionViews();
      return {
        ok: true,
        message: `Carrier invoice ${normalized.invoiceNumber} staged.`,
        details: { invoiceId, invoiceNumber: normalized.invoiceNumber, carrier: selectedCarrier },
      };
    }

    if (mode === 'wms_webhook') {
      const selectedSource = source?.toLowerCase();
      if (selectedSource !== 'shipstation' && selectedSource !== 'shopify') {
        return { ok: false, error: 'WMS webhook mode requires source = shipstation or shopify.' };
      }
      if (!clientId) {
        return { ok: false, error: 'WMS webhook mode requires a client.' };
      }
      const payload = parseJsonObject(body, 'webhook JSON');
      const normalized = selectedSource === 'shipstation'
        ? normalizeFromShipStation(payload as any, clientId)
        : normalizeFromShopify(payload as any, clientId);
      const shipmentId = await stageClientShipment(normalized);
      revalidateIngestionViews();
      return {
        ok: true,
        message: `WMS shipment staged for ${selectedSource}.`,
        details: { shipmentId, source: selectedSource, clientId },
      };
    }

    if (mode === 'edi_raw') {
      const ctx = createMappingContext(await loadLearnedMappings(), 'edi');
      const edi = parseEdi210(body);
      const normalized = normalizeEdi210(edi, ctx);
      const invoiceId = await stageInvoice(normalized);
      const newExceptions = await persistExceptions(ctx.exceptions);
      if (newExceptions > 0) await annotateOpenExceptions();
      revalidateIngestionViews();
      return {
        ok: true,
        message: `EDI invoice ${normalized.invoiceNumber} staged.`,
        details: { invoiceId, invoiceNumber: normalized.invoiceNumber, newExceptions },
      };
    }

    if (mode === 'ltl_csv') {
      if (!scac) {
        return { ok: false, error: 'LTL CSV mode requires a carrier SCAC.' };
      }
      const ctx = createMappingContext(await loadLearnedMappings(), 'csv');
      const invoices = parseLtlCsv(body, { scac: scac.toUpperCase() }, ctx);
      const results = await Promise.allSettled(invoices.map((invoice) => stageInvoice(invoice)));
      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.filter((result) => result.status === 'rejected').length;
      const newExceptions = await persistExceptions(ctx.exceptions);
      if (newExceptions > 0) await annotateOpenExceptions();
      revalidateIngestionViews();
      return {
        ok: true,
        message: `Processed ${invoices.length} LTL CSV invoice row(s).`,
        details: { scac: scac.toUpperCase(), invoices: invoices.length, succeeded, failed, newExceptions },
      };
    }

    return { ok: false, error: 'Unsupported manual ingestion mode.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function revalidateIngestionViews() {
  revalidatePath('/ingestion');
  revalidatePath('/ingestion/3pl');
  revalidatePath('/queue');
  revalidatePath('/engine');
}

function parseJsonObject(input: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error(`Invalid ${label}. Paste a valid JSON object.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}. Paste a JSON object, not an array or primitive.`);
  }
  return value as Record<string, unknown>;
}
