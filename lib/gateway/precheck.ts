/**
 * lib/gateway/precheck.ts — Gateway precheck logic.
 *
 * Core evaluation function called by the /v1/precheck API route.
 * Fetches effective-dated policy rules (ADR 0016 D3), builds a
 * ShipmentPolicyContext from the shipment record, evaluates, and
 * synchronously logs per-decision rows to gateway_decisions (ADR 0016 D2).
 *
 * Follows ADR 0004 (gateway is a mode, not a service) and ADR 0003 D2
 * (one evaluator feeds both gateway and auditor).
 */

import { evaluatePolicyContext } from '@/lib/intelligence/policy-evaluator';
import type {
  PolicyDecision,
  ShipmentPolicyContext,
  PolicyRuleForEvaluation,
  PolicyCondition,
  PolicyAction,
} from '@/lib/intelligence/policy-evaluator';
import { GATEWAY_ACTIONS, type GatewayAction } from '@/lib/intelligence/taxonomy';
import { getSql } from '@/lib/db';
import type { PoolClient } from '@neondatabase/serverless';
import { getCachedPrecheck, setCachedPrecheck } from './cache';
import type { CachedPrecheckResult } from './cache';

export interface PrecheckInput {
  clientId: string;
  trackingNumber: string;
  carrierScac: string;
  /** Tenant-restricted SQL connection for RLS-protected decision writes (ADR 0016 D2) */
  tenantSql?: PoolClient;
}

export interface PrecheckResult {
  decisions: PolicyDecision[];
  risk_tier: 'low' | 'medium' | 'high';
  overall_action: GatewayAction;
  precheck_id: string;
  error?: string;
}

// ── Risk tiering ──────────────────────────────────────────────────────

function computeRiskTier(decisions: PolicyDecision[]): 'low' | 'medium' | 'high' {
  let hasBlock = false;
  let hasWarnOrRequire = false;

  for (const d of decisions) {
    if (d.decision === 'BLOCK') {
      hasBlock = true;
    }
    if (d.decision === 'WARN' || d.decision === 'REQUIRE_APPROVAL' || d.decision === 'REQUIRE_DOCUMENTATION') {
      hasWarnOrRequire = true;
    }
  }

  if (hasBlock) return 'high';
  if (hasWarnOrRequire) return 'medium';
  return 'low';
}

function aggregateAction(decisions: PolicyDecision[]): GatewayAction {
  const SEVERITY: Record<string, number> = {
    BLOCK: 5,
    REQUIRE_APPROVAL: 4,
    REQUIRE_DOCUMENTATION: 3,
    WARN: 2,
    ALLOW: 1,
  };
  let worst: GatewayAction = 'ALLOW';
  let worstScore = SEVERITY.ALLOW;
  for (const d of decisions) {
    const score = SEVERITY[d.decision] ?? 0;
    if (score > worstScore) {
      worstScore = score;
      worst = d.decision;
    }
  }
  return worst;
}

// ── Cache key ─────────────────────────────────────────────────────────

function cacheKey(input: PrecheckInput): string {
  return `${input.clientId}:${input.trackingNumber}:${input.carrierScac}`;
}

// ── DB helpers ────────────────────────────────────────────────────────

async function fetchShipment(trackingNumber: string): Promise<Record<string, unknown> | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM "Shipments"
    WHERE "Tracking number" = ${trackingNumber}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return (rows as Record<string, unknown>[])[0] ?? null;
}

// ── Effective-dated ruleset read (ADR 0016 D3) ───────────────────────
//
// Resolution order:
//   1. Latest attested ruleset where attested_at <= NOW()
//   2. Active (status = 'active') ruleset
//   3. Empty ruleset → no rules, ALLOW everything (global default)

interface ResolvedRuleset {
  rulesetId: string;
  version: string;
  source: 'attested' | 'active';
}

async function resolveEffectiveRuleset(clientId: string): Promise<ResolvedRuleset | null> {
  const sql = getSql();

  // Strategy 1: latest attested ruleset
  const attestedRows = await sql`
    SELECT prs.id, prs.version, pa.attested_at
    FROM policy_rulesets prs
    JOIN policy_attestations pa ON pa.ruleset_id = prs.id AND pa.client_id = prs.client_id
    WHERE prs.client_id = ${clientId}
      AND prs.deleted_at IS NULL
      AND pa.attested_at <= NOW()
      AND (pa.valid_until IS NULL OR pa.valid_until > NOW())
    ORDER BY pa.attested_at DESC
    LIMIT 1
  `;
  const attested = (attestedRows as Record<string, unknown>[])[0];
  if (attested) {
    return {
      rulesetId: String(attested.id),
      version: String(attested.version),
      source: 'attested',
    };
  }

  // Strategy 2: active (status = 'active') ruleset
  const activeRows = await sql`
    SELECT id, version FROM policy_rulesets
    WHERE client_id = ${clientId}
      AND status = 'active'
      AND deleted_at IS NULL
    ORDER BY effective_from DESC NULLS LAST
    LIMIT 1
  `;
  const active = (activeRows as Record<string, unknown>[])[0];
  if (active) {
    return {
      rulesetId: String(active.id),
      version: String(active.version),
      source: 'active',
    };
  }

  return null;
}

async function fetchRulesForRuleset(rulesetId: string): Promise<PolicyRuleForEvaluation[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      pr.id,
      pr.client_id,
      pr.ruleset_id,
      pr.rule_key,
      pr.category,
      pr.condition_json,
      pr.action_json,
      pr.severity,
      pr.status,
      pr.clause_ref
    FROM policy_rules pr
    WHERE pr.ruleset_id = ${rulesetId}
      AND pr.status = 'active'
      AND pr.deleted_at IS NULL
    ORDER BY pr.rule_key
  `;

  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    rulesetId: String(row.ruleset_id),
    ruleKey: String(row.rule_key),
    category: String(row.category),
    conditionJson: (row.condition_json as PolicyCondition) ?? {},
    actionJson: (row.action_json as PolicyAction) ?? { decision: 'WARN', message: '' },
    severity: (String(row.severity) as 'info' | 'warn' | 'block') ?? 'warn',
    status: (String(row.status) as PolicyRuleForEvaluation['status']) ?? 'active',
    clauseRef: row.clause_ref ? String(row.clause_ref) : null,
  }));
}

function buildShipmentContext(
  clientId: string,
  shipment: Record<string, unknown> | null,
  input: PrecheckInput,
): ShipmentPolicyContext {
  return {
    clientId,
    shipmentId: shipment ? String(shipment.id ?? '') : null,
    invoiceId: null,
    auditResultId: null,
    carrier: input.carrierScac || (shipment ? String(shipment['Carrier SCAC'] ?? shipment['Carrier scac'] ?? '') : null),
    serviceLevel: shipment ? String(shipment['Service level'] ?? shipment['Service Level'] ?? '') : null,
    destinationZip: shipment ? String(shipment['Destination zip'] ?? shipment['Destination Zip'] ?? '') : null,
    destinationCountry: shipment ? String(shipment['Destination country'] ?? shipment['Destination Country'] ?? '') : null,
    destinationRiskTier: shipment ? String(shipment['Destination risk tier'] ?? shipment['Destination Risk Tier'] ?? '') : null,
    shipperVertical: shipment ? String(shipment['Shipper vertical'] ?? shipment['Shipper Vertical'] ?? '') : null,
    commodityType: shipment ? String(shipment['Commodity type'] ?? shipment['Commodity Type'] ?? '') : null,
    declaredValue: shipment ? parseNumeric(shipment['Declared value'] ?? shipment['Declared Value']) : null,
    insuredValue: shipment ? parseNumeric(shipment['Insured value'] ?? shipment['Insured Value']) : null,
    insuranceProvider: shipment ? String(shipment['Insurance provider'] ?? shipment['Insurance Provider'] ?? '') : null,
    signatureType: shipment ? String(shipment['Signature type'] ?? shipment['Signature Type'] ?? '') : null,
    packageType: shipment ? String(shipment['Package type'] ?? shipment['Package Type'] ?? '') : null,
    documentationReceived: null,
    preventableLoss: null,
    uninsuredExposure: null,
  };
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ── Decision logging (ADR 0016 D2 — synchronous, in-txn) ────────────

async function logDecisions(
  decisions: PolicyDecision[],
  clientId: string,
  precheckId: string,
  riskTier: string,
  rulesetVersion: string | null,
  context: ShipmentPolicyContext,
  tenantSql?: PoolClient,
): Promise<void> {
  for (const d of decisions) {
    const id = 'gd' + crypto.randomUUID().replace(/-/g, '');
    const requestJson = JSON.stringify(context);
    const violationsJson = JSON.stringify([d]);

    if (tenantSql) {
      // Tenant-restricted PoolClient (RLS-protected) — use parameterized query()
      await tenantSql.query(
        `INSERT INTO gateway_decisions
           (id, client_id, correlation_id, request_json, decision,
            enforced, violations, ruleset_version, degraded,
            ruleset_snapshot_id, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10, NOW())`,
        [id, clientId, precheckId, requestJson, d.decision,
         false, violationsJson, rulesetVersion, false, null],
      );
    } else {
      // HTTP driver (owner role, no RLS) — fallback for degraded path
      const sql = getSql();
      await sql`
        INSERT INTO gateway_decisions
          (id, client_id, correlation_id, request_json, decision,
           enforced, violations, ruleset_version, degraded,
           ruleset_snapshot_id, created_at)
        VALUES
          (${id},
           ${clientId},
           ${precheckId},
           ${requestJson}::jsonb,
           ${d.decision},
           false,
           ${violationsJson}::jsonb,
           ${rulesetVersion},
           false,
           ${null},
           NOW())
      `;
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────

export async function runPrecheck(input: PrecheckInput): Promise<PrecheckResult> {
  const key = cacheKey(input);
  const cached = getCachedPrecheck(key);
  if (cached) {
    return { ...cached, error: undefined };
  }

  const precheckId = 'pc_' + crypto.randomUUID().replace(/-/g, '');

  try {
    // 1. Resolve effective-dated ruleset (ADR 0016 D3)
    const resolvedRuleset = await resolveEffectiveRuleset(input.clientId);

    // 2. Fetch shipment data and rules in parallel
    const rules: PolicyRuleForEvaluation[] = resolvedRuleset
      ? await fetchRulesForRuleset(resolvedRuleset.rulesetId)
      : [];

    const shipment = await fetchShipment(input.trackingNumber);

    const rulesetVersion = resolvedRuleset?.version ?? null;
    logInfo('ruleset resolved', {
      clientId: input.clientId,
      rulesetId: resolvedRuleset?.rulesetId ?? null,
      rulesetVersion,
      source: resolvedRuleset?.source ?? 'none',
      ruleCount: rules.length,
    });

    // 3. Build policy context
    const context = buildShipmentContext(input.clientId, shipment, input);

    // 4. Evaluate
    const decisions = evaluatePolicyContext({
      context,
      rules,
      mode: 'pre_shipment',
    });

    // 5. Risk tier and overall action
    const risk_tier = computeRiskTier(decisions);
    const overall_action = aggregateAction(decisions);

    // 6. Log decisions synchronously (ADR 0016 D2)
    if (decisions.length > 0) {
      try {
        await logDecisions(
          decisions,
          input.clientId,
          precheckId,
          risk_tier,
          rulesetVersion,
          context,
          input.tenantSql,
        );
      } catch (logErr) {
        // Degrade gracefully — don't block the response on write failure
        console.error('gateway decision logging failed (degraded)', {
          precheckId,
          clientId: input.clientId,
          err: String(logErr),
        });
      }
    }

    const result: PrecheckResult = {
      decisions,
      risk_tier,
      overall_action,
      precheck_id: precheckId,
    };

    setCachedPrecheck(key, result as CachedPrecheckResult);

    return result;
  } catch (err) {
    // Fail-closed: if the evaluator throws, return high-risk BLOCK (ADR 0004)
    console.error('gateway precheck evaluation failed', {
      precheckId,
      clientId: input.clientId,
      trackingNumber: input.trackingNumber,
      err: String(err),
    });

    return {
      decisions: [{
        decision: 'BLOCK',
        ruleId: null,
        ruleKey: 'evaluator_unavailable',
        category: 'DATA_REQUIRED',
        message: 'Evaluator unavailable — manual review required.',
        confidence: 0,
        preventableLoss: 0,
        uninsuredExposure: 0,
      }],
      risk_tier: 'high',
      overall_action: 'BLOCK',
      precheck_id: precheckId,
      error: 'Evaluator unavailable',
    };
  }
}

// ── Internal logging helper ───────────────────────────────────────────

function logInfo(message: string, data: Record<string, unknown>): void {
  // Structured via console for now; routes through withObservability logger
  console.log(JSON.stringify({ event: 'precheck', message, ...data }));
}
