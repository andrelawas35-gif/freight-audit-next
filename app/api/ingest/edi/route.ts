/*
  POST /api/ingest/edi

  Receives EDI 210 payloads from your EDI translator (Stedi or Orderful).
  They translate the raw EDI file and POST clean JSON to this endpoint.

  Expected body: { raw: string }  — the raw EDI 210 text
  OR (if Stedi/Orderful pre-parses): { parsed: EdiRawInvoice }

  Protect with INGEST_SECRET env var (set same value in your EDI translator webhook config).
*/

import { NextRequest, NextResponse } from 'next/server';
import { parseEdi210 } from '@/lib/ingestion/edi/parser';
import { normalizeEdi210 } from '@/lib/ingestion/carriers/from-edi';
import { stageInvoice } from '@/lib/ingestion/normalize';
import { loadLearnedMappings, createMappingContext, persistExceptions } from '@/lib/ingestion/mappings';
import { annotateOpenExceptions } from '@/lib/ingestion/data-clerk';

export async function POST(req: NextRequest) {
  // Auth
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const rawEdi: string = body.raw;

    if (!rawEdi) {
      return NextResponse.json({ error: 'Missing raw EDI body' }, { status: 400 });
    }

    const ctx        = createMappingContext(await loadLearnedMappings(), 'edi');
    const parsed     = parseEdi210(rawEdi);
    const normalized = normalizeEdi210(parsed, ctx);
    const invoiceId  = await stageInvoice(normalized);
    const newExceptions = await persistExceptions(ctx.exceptions);
    if (newExceptions > 0) await annotateOpenExceptions();

    return NextResponse.json({ ok: true, invoiceId, invoiceNumber: normalized.invoiceNumber, newExceptions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ingest/edi]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
