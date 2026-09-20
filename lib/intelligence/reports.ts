import { getSql } from '@/lib/db';
import type { SqlLike } from '@/lib/db/records';

export type GatewayReadinessRow = {
  month: string;
  client_id: string | null;
  gateway_category: string | null;
  findings: number;
  margin_lost: number;
  gateway_roi: number;
};

export type GatewayRuleSuggestionRow = {
  client_id: string | null;
  gateway_category: string | null;
  gateway_rule_suggestion: string | null;
  findings: number;
  gateway_roi: number;
};

export type InsuranceExposureRow = {
  month: string;
  client_id: string;
  shipper_vertical: string | null;
  insurance_risk_category: string;
  shipment_count: number;
  exposed_value: number;
  preventable_exposure: number;
};

/** Summary of a client-scope exclusion for the Coverage Gap Feed. */
export type ScopeExclusionSummary = {
  id: string;
  clauseText: string;
  exclusionType: string;   // 'define' | 'exclude' | 'flag'
  status: string;          // 'excluded' | 'staff_approved' | 'defined'
  reason: string | null;   // client-provided reason
  excludedAt: string;
};

export async function getGatewayReadinessReport(input: {
  clientId?: string;
  months?: number;
} = {}, db?: SqlLike): Promise<GatewayReadinessRow[]> {
  const sql = db ?? getSql();
  const params: unknown[] = [];
  const where = [`"Gateway preventability" = 'PREVENTABLE_BY_GATEWAY'`];

  if (input.clientId) {
    params.push(input.clientId);
    where.push(`client_id = $${params.length}`);
  }
  if (input.months) {
    params.push(input.months);
    where.push(`"Audited at"::timestamptz >= now() - ($${params.length} || ' months')::interval`);
  }

  return (await sql.query(
    `SELECT
       date_trunc('month', "Audited at"::timestamptz)::date::text AS month,
       client_id,
       "Gateway category" AS gateway_category,
       count(*)::int AS findings,
       coalesce(sum("Variance"), 0) AS margin_lost,
       coalesce(sum("Gateway estimated savings"), 0) AS gateway_roi
     FROM "Audit Results"
     WHERE ${where.join(' AND ')}
     GROUP BY 1, 2, 3
     ORDER BY month DESC, gateway_roi DESC`,
    params
  )) as GatewayReadinessRow[];
}

export async function getTopGatewayRuleSuggestions(input: {
  clientId?: string;
  limit?: number;
} = {}, db?: SqlLike): Promise<GatewayRuleSuggestionRow[]> {
  const sql = db ?? getSql();
  const params: unknown[] = [];
  const where = [
    `"Gateway preventability" = 'PREVENTABLE_BY_GATEWAY'`,
    `"Gateway rule suggestion" IS NOT NULL`,
  ];

  if (input.clientId) {
    params.push(input.clientId);
    where.push(`client_id = $${params.length}`);
  }

  params.push(input.limit ?? 20);
  const limitParam = params.length;

  return (await sql.query(
    `SELECT
       client_id,
       "Gateway category" AS gateway_category,
       "Gateway rule suggestion" AS gateway_rule_suggestion,
       count(*)::int AS findings,
       coalesce(sum("Gateway estimated savings"), 0) AS gateway_roi
     FROM "Audit Results"
     WHERE ${where.join(' AND ')}
     GROUP BY 1, 2, 3
     ORDER BY gateway_roi DESC, findings DESC
     LIMIT $${limitParam}`,
    params
  )) as GatewayRuleSuggestionRow[];
}

export async function getInsuranceExposureReport(input: {
  clientId?: string;
  months?: number;
} = {}, db?: SqlLike): Promise<InsuranceExposureRow[]> {
  const sql = db ?? getSql();
  const params: unknown[] = [];
  const where = [`gateway_preventability = 'PREVENTABLE_BY_GATEWAY'`];

  if (input.clientId) {
    params.push(input.clientId);
    where.push(`client_id = $${params.length}`);
  }
  if (input.months) {
    params.push(input.months);
    where.push(`created_at >= now() - ($${params.length} || ' months')::interval`);
  }

  return (await sql.query(
    `SELECT
       date_trunc('month', created_at)::date::text AS month,
       client_id,
       shipper_vertical,
       insurance_risk_category,
       count(*)::int AS shipment_count,
       coalesce(sum(declared_value), 0) AS exposed_value,
       coalesce(sum(estimated_uninsured_exposure), 0) AS preventable_exposure
     FROM shipment_insurance_audit_results
     WHERE ${where.join(' AND ')}
     GROUP BY 1, 2, 3, 4
     ORDER BY month DESC, preventable_exposure DESC`,
    params
  )) as InsuranceExposureRow[];
}

/**
 * Fetch scope exclusions for a client that have been finalized (excluded or
 * staff-approved). Used by the Coverage Gap Feed to annotate categories the
 * client has intentionally opted out of enforcing.
 */
export async function getClientScopeExclusions(
  clientId: string,
  db?: SqlLike,
): Promise<ScopeExclusionSummary[]> {
  const sql = db ?? getSql();
  const rows = await sql.query(
    `SELECT id, clause_text, exclusion_type, status, reason, excluded_at
     FROM policy_scope_exclusions
     WHERE client_id = $1
       AND exclusion_type = 'exclude'
       AND status IN ('excluded', 'staff_approved')
       AND deleted_at IS NULL
     ORDER BY excluded_at DESC
     LIMIT 200`,
    [clientId],
  ) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id ?? ''),
    clauseText: String(r.clause_text ?? ''),
    exclusionType: String(r.exclusion_type ?? 'exclude'),
    status: String(r.status ?? 'excluded'),
    reason: r.reason ? String(r.reason) : null,
    excludedAt: String(r.excluded_at ?? ''),
  }));
}

// ── Data Readiness (Data Maturity Audit, $500 deliverable) ──────────

/** Per-field data completeness for a client. */
export type DataReadinessField = {
  field: string;
  nullRate: number;
  totalShipments: number;
  nonNullShipments: number;
  requiredByRulesCount: number;
  dependentRules: Array<{
    ruleKey: string;
    category: string;
    severity: string;
  }>;
};

/** Full data readiness report for the Data Maturity Audit. */
export type DataReadinessReport = {
  clientId: string;
  generatedAt: string;
  overallCompletenessScore: number;
  fields: DataReadinessField[];
  assessmentTier: 'data_maturity_audit' | 'compliance_risk_assessment';
  recommendation: string;
};

/**
 * Condition-to-context field mapping — mirrors policy-service.ts.
 * Determines which ShipmentPolicyContext fields each PolicyCondition key reads from.
 */
const CONDITION_TO_FIELD: Record<string, string> = {
  declaredValueGte: '"Declared value"',
  declaredValueGt: '"Declared value"',
  declaredValueLte: '"Declared value"',
  insuredValueLtDeclared: '"Insured value"',
  carrierIn: '"Carrier"',
  carrierNotIn: '"Carrier"',
  serviceIn: '"Service level"',
  serviceNotIn: '"Service level"',
  shipperVertical: '"Shipper vertical"',
  commodityType: '"Commodity type"',
  commodityIn: '"Commodity type"',
  destinationCountryIn: '"Destination country"',
  destinationZipIn: '"Destination zip"',
  destinationRiskTierIn: '"Destination risk tier"',
  signatureRequiredAbove: '"Signature type"',
  signatureTypeIn: '"Signature type"',
  documentationRequired: '"Documentation received"',
  packageTypeIn: '"Package type"',
};

/** Unique context fields that rules can depend on. */
const CONTEXT_FIELDS = [...new Set(Object.values(CONDITION_TO_FIELD))];

/**
 * Generate a Data Readiness Report for a client.
 *
 * Computes per-field null-rates across all shipments, cross-references
 * with active policy_rules to show which fields are blocking rule evaluation,
 * and determines if the client qualifies for a Data Maturity Audit or
 * a full Compliance Risk Assessment.
 */
export async function getDataReadinessReport(
  clientId: string,
  db?: SqlLike,
): Promise<DataReadinessReport> {
  const sql = db ?? getSql();

  // 1. Per-field null rates across shipments
  const fields: DataReadinessField[] = [];

  for (const fieldName of CONTEXT_FIELDS) {
    const rows = await sql.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ${fieldName} IS NULL)::int AS null_count
       FROM "Shipments"
       WHERE "Client" @> ARRAY[$1]`,
      [clientId],
    ) as { total: number; null_count: number }[];

    const r = rows[0];
    const total = r?.total ?? 0;
    const nullCount = r?.null_count ?? 0;
    const nullRate = total > 0 ? nullCount / total : 1;
    const nonNullShipments = total - nullCount;

    // Cross-reference: how many active rules depend on this field?
    const conditionKeys = Object.entries(CONDITION_TO_FIELD)
      .filter(([, f]) => f === fieldName)
      .map(([k]) => k);

    let dependentRules: DataReadinessField['dependentRules'] = [];
    let requiredByRulesCount = 0;

    if (conditionKeys.length > 0) {
      const keyConditions = conditionKeys
        .map((k, i) => `condition_json ? '${k}'`)
        .join(' OR ');

      const ruleRows = await sql.query(
        `SELECT rule_key, category, severity
         FROM policy_rules
         WHERE client_id = $1
           AND status = 'active'
           AND (${keyConditions})
         LIMIT 50`,
        [clientId],
      ) as { rule_key: string; category: string; severity: string }[];

      dependentRules = ruleRows.map(rr => ({
        ruleKey: rr.rule_key,
        category: rr.category,
        severity: rr.severity,
      }));
      requiredByRulesCount = dependentRules.length;
    }

    fields.push({
      field: fieldName.replace(/"/g, ''),
      nullRate,
      totalShipments: total,
      nonNullShipments,
      requiredByRulesCount,
      dependentRules,
    });
  }

  // 2. Overall score
  const scores = fields.map(f => 1 - f.nullRate);
  const overallCompletenessScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  // 3. Assessment tier
  const criticalFields = fields.filter(
    f => f.requiredByRulesCount > 0 && f.nullRate > 0.5,
  );
  const assessmentTier = criticalFields.length > 0
    ? 'data_maturity_audit'
    : 'compliance_risk_assessment';

  // 4. Recommendation
  const sparseFieldNames = criticalFields.map(f => f.field).join(', ');
  const recommendation = assessmentTier === 'data_maturity_audit'
    ? `Improve data capture for: ${sparseFieldNames}. These fields are required by ${criticalFields.reduce((s, f) => s + f.requiredByRulesCount, 0)} active rules. Schedule a $500 Data Maturity Audit to identify root causes.`
    : 'Data completeness is sufficient for a full Compliance Risk Assessment ($1,000).';

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    overallCompletenessScore: Math.round(overallCompletenessScore * 100) / 100,
    fields,
    assessmentTier,
    recommendation,
  };
}
