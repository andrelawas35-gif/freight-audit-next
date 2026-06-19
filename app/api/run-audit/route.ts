/*
  POST /api/run-audit
  Body (JSON, all optional):
    { clientId?: string, dryRun?: boolean }

  Returns:
    { invoicesChecked, findingsCreated, totalVariance, errors }

  Protect this route in production — add Bearer token check or
  wrap with Vercel's password protection at the deployment level.
*/

import { NextRequest, NextResponse } from 'next/server';
import { runAudit } from '@/lib/audit/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { clientId, dryRun } = body as { clientId?: string; dryRun?: boolean };

    const summary = await runAudit({ clientId, dryRun });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
