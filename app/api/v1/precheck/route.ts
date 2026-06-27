/**
 * POST /api/v1/precheck — Gateway precheck endpoint.
 *
 * ADR 0004: Gateway is a mode of the evaluator, deployed as a Next.js API route.
 * Always returns HTTP 200 — compliance BLOCK is a successful evaluation (D3 always-200 contract).
 *
 * Auth: x-gateway-api-key header OR session with staff role.
 * Body: { clientId: string, trackingNumber: string, carrierScac: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { runPrecheck } from '@/lib/gateway/precheck';
import { withObservability } from '@/lib/api-handler';

const precheckBodySchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  trackingNumber: z.string().min(1, 'trackingNumber is required'),
  carrierScac: z.string().min(1, 'carrierScac is required'),
});

export const POST = withObservability('v1/precheck', async (req, { log, correlationId }) => {
  // ── Auth ──────────────────────────────────────────────────────────
  const gatewayApiKey = req.headers.get('x-gateway-api-key');
  const configuredKey = process.env.GATEWAY_API_KEY;

  let authorized = false;

  if (gatewayApiKey && configuredKey && gatewayApiKey === configuredKey) {
    authorized = true;
  } else {
    // Fallback: check staff session
    const session = await auth();
    if (session?.user?.role === 'staff') {
      authorized = true;
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

  const { clientId, trackingNumber, carrierScac } = parsed.data;

  // ── Run precheck ──────────────────────────────────────────────────
  log.info('precheck requested', { clientId, trackingNumber, carrierScac });

  const result = await runPrecheck({ clientId, trackingNumber, carrierScac });

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
});
