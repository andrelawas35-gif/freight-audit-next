/*
  POST /api/ingest/3pl

  Ingests a 3PL invoice section (fulfillment/shipping or storage ledger).
  Three-way match (fulfillment) happens at stage time against client shipments.

  Body:
    {
      clientId: string,
      cycle: string,            // billing cycle, e.g. "2026-06"
      type: "fulfillment" | "storage",
      scac?: string,            // the 3PL's code (for freight markup rules)
      csv: string
    }

  Secured with the INGEST_SECRET header.
*/

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseFulfillmentCsv, parseStorageCsv } from '@/lib/ingestion/3pl/parse';
import { stageFulfillment, stageStorage } from '@/lib/ingestion/3pl/stage';
import { startBatch, finishBatch, trackRecord } from '@/lib/ingestion/lineage';
import { withObservability } from '@/lib/api-handler';

const bodySchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  cycle: z.string().min(1, 'cycle is required'),
  type: z.enum(['fulfillment', 'storage']).optional(),
  scac: z.string().optional(),
  csv: z.string().min(1, 'csv is required'),
});

export const POST = withObservability('ingest/3pl', async (req, { log }) => {
  if (req.headers.get('x-ingest-secret') !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid 3PL body', { details: parsed.error.flatten() });
    return NextResponse.json(
      { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { clientId, cycle, type, scac, csv } = parsed.data;

  const batchId = await startBatch('API', {
    carrierScac: scac ?? undefined,
    clientId,
    fileName: `3pl/${type ?? 'fulfillment'}/${cycle}`,
  });

  try {
    if (type === 'storage') {
      const { lines, rowCount, skipped } = parseStorageCsv(csv);
      const { staged } = await stageStorage({ clientId, cycle, lines });
      await finishBatch(batchId, { rowCount, stagedCount: staged, errorCount: skipped });
      log.info('3PL storage staged', { clientId, cycle, rows: rowCount, staged, skipped, batchId });
      return NextResponse.json({ ok: true, type, rows: rowCount, staged, skipped, batchId });
    }

    const { lines, rowCount, skipped } = parseFulfillmentCsv(csv);
    const result = await stageFulfillment({ clientId, carrierScac: scac ?? null, cycle, lines });
    await finishBatch(batchId, { rowCount, stagedCount: result.staged, errorCount: skipped });
    log.info('3PL fulfillment staged', { clientId, cycle, rows: rowCount, skipped, batchId });
    return NextResponse.json({ ok: true, type: 'fulfillment', rows: rowCount, skipped, batchId, ...result });
  } catch (err: any) {
    await finishBatch(batchId, { rowCount: 0, stagedCount: 0, errorCount: 1 });
    throw err;
  }
});
