/*
  POST /api/ingest/carrier

  Receives normalized carrier API invoice data (FedEx or UPS).
  Your polling job or carrier push webhook calls this.

  Body:
    { carrier: 'fedex' | 'ups', invoice: <carrier-specific shape> }
*/

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeFromFedexApi } from '@/lib/ingestion/carriers/fedex-api';
import { normalizeFromUpsApi }   from '@/lib/ingestion/carriers/ups-api';
import { stageInvoice }          from '@/lib/ingestion/normalize';
import { withObservability }     from '@/lib/api-handler';

const bodySchema = z.object({
  carrier: z.enum(['fedex', 'ups']),
  invoice: z.record(z.string(), z.unknown()),
});

export const POST = withObservability('ingest/carrier', async (req, { log }) => {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid request body', { details: parsed.error.flatten() });
    return NextResponse.json(
      { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { carrier, invoice } = parsed.data;

  const normalized = carrier === 'fedex'
    ? normalizeFromFedexApi(invoice as any)
    : normalizeFromUpsApi(invoice as any);

  const invoiceId = await stageInvoice(normalized);
  log.info('invoice staged', { invoiceId, invoiceNumber: normalized.invoiceNumber, carrier });
  return NextResponse.json({ ok: true, invoiceId, invoiceNumber: normalized.invoiceNumber });
});
