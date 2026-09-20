/*
  GET /api/health

  Lightweight liveness + readiness probe.
  Returns 200 if the app can reach Postgres; 503 otherwise.
  Designed for Vercel health checks, uptime monitors, and load balancers.
*/

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  try {
    const sql = getSql();
    const result = await sql`SELECT 1 AS ok` as Record<string, unknown>[];
    const latencyMs = Date.now() - start;
    checks.database = { status: 'ok', latencyMs };

    if (!result?.[0]?.ok) {
      checks.database = { status: 'degraded', latencyMs, error: 'unexpected query result' };
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    checks.database = { status: 'error', latencyMs, error: message };
    log.error('health check: database unreachable', { err: err as Error });
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const status = allOk ? 'healthy' : 'unhealthy';
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      uptime: Math.floor(process.uptime()),
      checks,
    },
    { status: httpStatus },
  );
}
