/*
  POST /api/ingest/edi

  Receives EDI 210 payloads from your EDI translator (Stedi or Orderful).
  They translate the raw EDI file and POST clean JSON to this endpoint.

  Expected body: { raw: string }  — the raw EDI 210 text
  OR (if Stedi/Orderful pre-parses): { parsed: EdiRawInvoice }

  Protect with INGEST_SECRET env var (set same value in your EDI translator webhook config).
*/

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseEdi210 } from '@/lib/ingestion/edi/parser';
import { normalizeEdi210 } from '@/lib/ingestion/carriers/from-edi';
import { stageInvoice } from '@/lib/ingestion/normalize';
import { loadLearnedMappings, createMappingContext, persistExceptions } from '@/lib/ingestion/mappings';
import { annotateOpenExceptions } from '@/lib/ingestion/data-clerk';
import { startBatch, finishBatch, trackRecord } from '@/lib/ingestion/lineage';
import { withObservability } from '@/lib/api-handler';

const bodySchema = z.object({
  raw: z.string().min(1, 'Missing raw EDI body'),
});

export const POST = withObservability('ingest/edi', async (req, { log }) => {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const validated = bodySchema.safeParse(body);
  if (!validated.success) {
    log.warn('invalid EDI body', { issue: validated.error.issues[0]?.message });
    return NextResponse.json(
      { ok: false, error: validated.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }
  const rawEdi = validated.data.raw;

  const batchId = await startBatch('API', { fileName: 'edi/210' });

  try {
    const ctx        = createMappingContext(await loadLearnedMappings(), 'edi');
    const parsed     = parseEdi210(rawEdi);
    const normalized = normalizeEdi210(parsed, ctx);
    const invoiceId  = await stageInvoice(normalized);
    await trackRecord(batchId, rawEdi, 'invoice', invoiceId);

    const newExceptions = await persistExceptions(ctx.exceptions);
    if (newExceptions > 0) await annotateOpenExceptions();

    await finishBatch(batchId, { rowCount: 1, stagedCount: 1, errorCount: 0 });
    log.info('EDI invoice staged', { invoiceId, invoiceNumber: normalized.invoiceNumber, newExceptions, batchId });
    return NextResponse.json({ ok: true, invoiceId, invoiceNumber: normalized.invoiceNumber, newExceptions, batchId });
  } catch (err: any) {
    await finishBatch(batchId, { rowCount: 1, stagedCount: 0, errorCount: 1 });
    throw err;
  }
});
