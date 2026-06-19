/*
  POST /api/ingest/sftp-poll

  Called by a cron job (Vercel Cron, AWS EventBridge, etc.) to process
  LTL carrier CSV files that have been downloaded from SFTP.

  The actual SFTP polling (SSH connection + file download) runs outside
  Next.js — in a Lambda, a GitHub Action, or a Vercel Cron that:
    1. SSHes into the SFTP server
    2. Downloads new CSV files
    3. POSTs each file's contents here

  Body:
    { scac: string, csv: string, columns?: Partial<LtlCsvColumnMap> }
*/

import { NextRequest, NextResponse } from 'next/server';
import { parseLtlCsv }       from '@/lib/ingestion/carriers/ltl-csv';
import { stageInvoice }      from '@/lib/ingestion/normalize';
import type { LtlCsvColumnMap } from '@/lib/ingestion/carriers/ltl-csv';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scac, csv, columns } = body as {
      scac: string;
      csv: string;
      columns?: Partial<LtlCsvColumnMap>;
    };

    if (!scac || !csv) {
      return NextResponse.json({ error: 'scac and csv are required' }, { status: 400 });
    }

    const invoices = parseLtlCsv(csv, { scac, columns });

    const results = await Promise.allSettled(
      invoices.map((inv) => stageInvoice(inv))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed    = results.filter((r) => r.status === 'rejected').length;
    const errors    = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason));

    return NextResponse.json({ ok: true, invoices: invoices.length, succeeded, failed, errors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ingest/sftp-poll]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
