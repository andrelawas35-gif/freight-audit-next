/**
 * POST /api/v1/precheck — Gateway precheck endpoint.
 *
 * ADR 0004: Gateway is a mode of the evaluator, deployed as a Next.js API route.
 * Always returns HTTP 200 — compliance BLOCK is a successful evaluation (D3 always-200 contract).
 *
 * Auth (ADR 0016 D1): Per-client API key (x-api-key header) → GATEWAY_API_KEY_<clientId> env vars.
 *   Fallback: single GATEWAY_API_KEY + body clientId (backward compat).
 *   Fallback: staff session.
 *
 * Body: { clientId?: string, trackingNumber: string, carrierScac: string }
 *   clientId is OPTIONAL — when using per-client keys, it is derived from the key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { runPrecheck } from '@/lib/gateway/precheck';
import { withObservability } from '@/lib/api-handler';
import { getTenantSql } from '@/lib/db';
import type { PoolClient } from '@neondatabase/serverless';

const precheckBodySchema = z.object({
  clientId: z.string().optional(),
  trackingNumber: z.string().min(1, 'trackingNumber is required'),
  carrierScac: z.string().min(1, 'carrierScac is required'),
}).refine(
  (data) => data.clientId === undefined || data.clientId.length > 0,
  { message: 'clientId, if provided, must not be empty', path: ['clientId'] },
);

/**
 * Resolve clientId from per-client API keys (ADR 0016 D1).
 *
 * Searches process.env for GATEWAY_API_KEY_<clientId> vars whose value
 * matches the supplied key. Returns the derived clientId or null.
 */
function resolveClientIdFromApiKey(key: string): string | null {
  const prefix = 'GATEWAY_API_KEY_';
  for (const [envName, envValue] of Object.entries(process.env)) {
    if (envName.startsWith(prefix) && envValue === key) {
      return envName.slice(prefix.length);
    }
  }
  return null;
}

export const POST = withObservability('v1/precheck', async (req, { log, correlationId }) => {
  // ── Auth ──────────────────────────────────────────────────────────
  const apiKey = req.headers.get('x-api-key');
  const legacyApiKey = req.headers.get('x-gateway-api-key');
  const effectiveKey = apiKey ?? legacyApiKey;

  let resolvedClientId: string | null = null;
  let authorized = false;

  // Strategy 1: Per-client API key (ADR 0016 D1)
  if (effectiveKey) {
    resolvedClientId = resolveClientIdFromApiKey(effectiveKey);
    if (resolvedClientId) {
      authorized = true;
      log.info('authenticated via per-client API key', { clientId: resolvedClientId });
    }
  }

  // Strategy 2: Single GATEWAY_API_KEY (backward compat)
  if (!authorized && effectiveKey) {
    const singleKey = process.env.GATEWAY_API_KEY;
    if (singleKey && effectiveKey === singleKey) {
      authorized = true;
      resolvedClientId = null; // will be derived from body below
      log.info('authenticated via single GATEWAY_API_KEY (legacy compat)');
    }
  }

  // Strategy 3: Staff session
  if (!authorized) {
    const session = await auth();
    if (session?.user?.role === 'staff') {
      authorized = true;
      resolvedClientId = null; // staff can specify clientId in body
      log.info('authenticated via staff session');
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const parsed = precheckBodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid precheck payload', { details: parsed.error.flatten() });
    return NextResponse.json(
      {
        error: 'Invalid request body',
        details: parsed.error.flatten(),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { clientId: bodyClientId, trackingNumber, carrierScac } = parsed.data;

  // ── Tenant resolution (ADR 0016 D1) ───────────────────────────────
  // Per-client key: clientId comes from the key, not the body.
  // Reject if body.clientId disagrees with the derived clientId.
  let clientId: string;

  if (resolvedClientId) {
    if (bodyClientId && bodyClientId !== resolvedClientId) {
      log.warn('clientId mismatch — body disagrees with API key', {
        bodyClientId,
        keyClientId: resolvedClientId,
      });
      return NextResponse.json(
        {
          error: 'clientId mismatch — the supplied API key is not valid for the requested clientId',
          correlationId,
        },
        { status: 403 },
      );
    }
    clientId = resolvedClientId;
  } else if (bodyClientId) {
    // Legacy compat: single GATEWAY_API_KEY or staff session — clientId from body
    clientId = bodyClientId;
  } else {
    return NextResponse.json(
      {
        error: 'clientId is required when not using a per-client API key',
        correlationId,
      },
      { status: 400 },
    );
  }

  log.info('precheck tenant resolved', { clientId, source: resolvedClientId ? 'api_key' : 'body' });

  // ── Acquire tenant SQL connection (ADR 0016 D2) ──────────────────
  let tenantSql: PoolClient | null = null;
  try {
    tenantSql = await getTenantSql(clientId);
  } catch (err) {
    log.error('failed to acquire tenant SQL connection', {
      clientId,
      err: err instanceof Error ? err.message : String(err),
    });
    // Continue without tenant SQL — decision logging will degrade gracefully
  }

  try {
    // ── Run precheck ────────────────────────────────────────────────
    log.info('precheck requested', { clientId, trackingNumber, carrierScac });

    const result = await runPrecheck({
      clientId,
      trackingNumber,
      carrierScac,
      tenantSql: tenantSql ?? undefined,
    });

    log.info('precheck completed', {
      precheckId: result.precheck_id,
      riskTier: result.risk_tier,
      overallAction: result.overall_action,
      decisionCount: result.decisions.length,
      error: result.error ?? null,
    });

    // Always 200 — even BLOCK is a successful evaluation (ADR 0004 D3)
    const response = NextResponse.json({
      decisions: result.decisions,
      risk_tier: result.risk_tier,
      overall_action: result.overall_action,
      precheck_id: result.precheck_id,
      correlationId,
    });

    response.headers.set('x-correlation-id', correlationId);
    return response;
  } finally {
    tenantSql?.release();
  }
});
