/**
 * precheck.ts — POST /v1/precheck handler (08-gateway.md D1-D3, D5).
 *
 * The core Gateway endpoint. Accepts a ShipmentPolicyContext payload,
 * evaluates against the cached client ruleset, and returns a D3-compliant
 * decision contract.
 *
 * @see docs/policy-intelligence/08-gateway.md
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { evaluatePolicyContext } from '../../../lib/intelligence/policy-evaluator';
import type {
  ShipmentPolicyContext,
  PolicyDecision,
} from '../../../lib/intelligence/policy-evaluator';
import { selectRulesForShipment } from './cache';
import { bufferDecision } from './decision-log';
import { getConfig, shouldFailClosed } from './config';

// ── Zod schema: matches ShipmentPolicyContext ──────────────────────────

const shipmentContextSchema = z.object({
  clientId: z.string().min(1),
  shipmentId: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  auditResultId: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  serviceLevel: z.string().nullable().optional(),
  destinationZip: z.string().nullable().optional(),
  destinationCountry: z.string().nullable().optional(),
  destinationRiskTier: z.string().nullable().optional(),
  shipperVertical: z.string().nullable().optional(),
  commodityType: z.string().nullable().optional(),
  declaredValue: z.number().nullable().optional(),
  insuredValue: z.number().nullable().optional(),
  insuranceProvider: z.string().nullable().optional(),
  signatureType: z.string().nullable().optional(),
  packageType: z.string().nullable().optional(),
  documentationReceived: z.array(z.string()).nullable().optional(),
  preventableLoss: z.number().nullable().optional(),
  uninsuredExposure: z.number().nullable().optional(),
}).passthrough(); // Generic JSON fallback for unknown fields (D1)

// ── Severity aggregation (D3) ──────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  BLOCK: 5,
  REQUIRE_APPROVAL: 4,
  REQUIRE_DOCUMENTATION: 3,
  WARN: 2,
  ALLOW: 1,
};

function aggregateDecision(decisions: PolicyDecision[]): string {
  let worst = 'ALLOW';
  let worstScore = SEVERITY_ORDER.ALLOW;
  for (const d of decisions) {
    const score = SEVERITY_ORDER[d.decision] ?? 0;
    if (score > worstScore) {
      worstScore = score;
      worst = d.decision;
    }
  }
  return worst;
}

// ── Response shape (D3 canonical contract) ─────────────────────────────

interface PrecheckResponse {
  decision: string;
  enforced: boolean;
  approval_token: string | null;
  violations: PolicyDecision[];
  correlationId: string;
  rulesetVersion: string | null;
}

// ── Handler ────────────────────────────────────────────────────────────

export async function precheckHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
  const startTime = Date.now();

  // 1. Parse and validate payload
  const parsed = shipmentContextSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({
      error: 'bad_request',
      message: 'Invalid precheck payload',
      details: parsed.error.issues,
      correlationId,
    });
    return;
  }

  const rawContext = parsed.data;

  // 2. Resolve clientId from API key (never from request body — D6)
  const clientId = request.gatewayClientId;
  if (!clientId) {
    reply.status(401).send({
      error: 'unauthorized',
      message: 'Client identity not resolved from API key',
      correlationId,
    });
    return;
  }

  // 3. Build ShipmentPolicyContext (override clientId from auth)
  const context: ShipmentPolicyContext = {
    clientId,
    shipmentId: rawContext.shipmentId ?? null,
    invoiceId: rawContext.invoiceId ?? null,
    auditResultId: rawContext.auditResultId ?? null,
    carrier: rawContext.carrier ?? null,
    serviceLevel: rawContext.serviceLevel ?? null,
    destinationZip: rawContext.destinationZip ?? null,
    destinationCountry: rawContext.destinationCountry ?? null,
    destinationRiskTier: rawContext.destinationRiskTier ?? null,
    shipperVertical: rawContext.shipperVertical ?? null,
    commodityType: rawContext.commodityType ?? null,
    declaredValue: rawContext.declaredValue ?? null,
    insuredValue: rawContext.insuredValue ?? null,
    insuranceProvider: rawContext.insuranceProvider ?? null,
    signatureType: rawContext.signatureType ?? null,
    packageType: rawContext.packageType ?? null,
    documentationReceived: rawContext.documentationReceived ?? null,
    preventableLoss: rawContext.preventableLoss ?? null,
    uninsuredExposure: rawContext.uninsuredExposure ?? null,
  };

  // 4. Load ruleset from cache
  const cached = selectRulesForShipment(clientId);
  const rulesetVersion = cached?.rulesetVersion ?? null;

  // 5. Evaluate (with risk-tiered fail-closed — D5)
  let violations: PolicyDecision[];
  let degraded = false;

  try {
    if (!cached) {
      // No ruleset for this client → default-allow, degraded
      degraded = true;
      violations = [{
        decision: 'ALLOW',
        ruleId: null,
        ruleKey: 'no_active_ruleset',
        category: 'COMPLIANT',
        message: 'No active ruleset found for this client. Defaulting to ALLOW.',
        confidence: 0,
        preventableLoss: 0,
        uninsuredExposure: 0,
      }];
    } else {
      violations = evaluatePolicyContext({
        context,
        rules: cached.rules,
        mode: 'pre_shipment',
      });
    }
  } catch (err) {
    // Evaluation error — fail-open or fail-closed based on risk tier
    const failClosed = shouldFailClosed(
      clientId,
      context.declaredValue,
      context.shipperVertical,
      getConfig().failClosedThresholds,
    );

    if (failClosed) {
      // Fail-closed: return DATA_REQUIRED (D5)
      violations = [{
        decision: 'REQUIRE_DOCUMENTATION',
        ruleId: null,
        ruleKey: 'gateway_unavailable_fail_closed',
        category: 'DATA_REQUIRED',
        message:
          'Gateway evaluation failed for a high-risk shipment. Manual review required before label purchase.',
        confidence: 0,
        preventableLoss: context.preventableLoss ?? 0,
        uninsuredExposure: context.uninsuredExposure ?? 0,
      }];
      degraded = true;
    } else {
      // Fail-open: return ALLOW (D5)
      violations = [{
        decision: 'ALLOW',
        ruleId: null,
        ruleKey: 'gateway_unavailable',
        category: 'COMPLIANT',
        message: 'Gateway evaluation unavailable. Proceeding without precheck.',
        confidence: 0,
        preventableLoss: 0,
        uninsuredExposure: 0,
      }];
      degraded = true;
    }

    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'gateway evaluation error',
        ts: new Date().toISOString(),
        correlationId,
        clientId,
        failClosed,
        err: String(err),
      }),
    );
  }

  // 6. Aggregate effective decision
  const effectiveDecision = aggregateDecision(violations);

  // 7. V1: shadow by default — always return the real verdict + token (D2)
  // In shadow mode, enforced=false even for BLOCK.
  // A hand-picked rule may be enforced, but that's a per-rule mode config
  // stored in the cache (future enhancement). For V1, all shadow.
  const enforced = false;

  // 8. Build response
  const response: PrecheckResponse = {
    decision: effectiveDecision,
    enforced,
    approval_token: uuidv4(), // Simple token for V1; sign with HMAC later
    violations,
    correlationId,
    rulesetVersion,
  };

  // 9. Buffer the decision for durable logging (off the response path — D6)
  const logEntry = {
    id: 'gd' + uuidv4().replace(/-/g, ''),
    client_id: clientId,
    correlation_id: correlationId,
    request_json: context,
    decision: effectiveDecision,
    enforced,
    violations,
    ruleset_version: rulesetVersion,
    degraded,
    ruleset_snapshot_id: rulesetVersion ? `snapshot-${rulesetVersion}` : null,
    created_at: new Date().toISOString(),
  };

  // Fire-and-forget buffer (respond first, persist second)
  bufferDecision(logEntry);

  // 10. Structured request log
  const durationMs = Date.now() - startTime;
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'precheck evaluated',
      ts: new Date().toISOString(),
      correlationId,
      clientId,
      decision: effectiveDecision,
      enforced,
      violationCount: violations.filter((v) => v.decision !== 'ALLOW').length,
      degraded,
      durationMs,
    }),
  );

  // Set correlation ID on response header
  reply.header('x-correlation-id', correlationId);

  // Always 200 (D3)
  reply.status(200).send(response);
}
