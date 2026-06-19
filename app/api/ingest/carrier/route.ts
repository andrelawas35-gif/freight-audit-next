/*
  POST /api/ingest/carrier

  Receives normalized carrier API invoice data (FedEx or UPS).
  Your polling job or carrier push webhook calls this.

  Body:
    { carrier: 'fedex' | 'ups', invoice: <carrier-specific shape> }
*/

import { NextRequest, NextResponse } from 'next/server';
import { normalizeFromFedexApi } from '@/lib/ingestion/carriers/fedex-api';
import { normalizeFromUpsApi }   from '@/lib/ingestion/carriers/ups-api';
import { stageInvoice }          from '@/lib/ingestion/normalize';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { carrier, invoice } = body as { carrier: string; invoice: unknown };

    let normalized;
    if (carrier === 'fedex') {
      normalized = normalizeFromFedexApi(invoice as any);
    } else if (carrier === 'ups') {
      normalized = normalizeFromUpsApi(invoice as any);
    } else {
      return NextResponse.json({ error: `Unknown carrier: ${carrier}` }, { status: 400 });
    }

    const invoiceId = await stageInvoice(normalized);
    return NextResponse.json({ ok: true, invoiceId, invoiceNumber: normalized.invoiceNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ingest/carrier]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
