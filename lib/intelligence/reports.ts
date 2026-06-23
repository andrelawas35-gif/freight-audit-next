import { getSql } from '@/lib/db';

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

export async function getGatewayReadinessReport(input: {
  clientId?: string;
  months?: number;
} = {}): Promise<GatewayReadinessRow[]> {
  const sql = getSql();
  const params: unknown[] = [];
  const where = [`"Gateway preventability" = 'PREVENTABLE_BY_GATEWAY'`];

  if (input.clientId) {
    params.push(input.clientId);
    where.push(`$${params.length} = ANY("Client")`);
  }
  if (input.months) {
    params.push(input.months);
    where.push(`"Audited at"::timestamptz >= now() - ($${params.length} || ' months')::interval`);
  }

  return (await sql.query(
    `SELECT
       date_trunc('month', "Audited at"::timestamptz)::date::text AS month,
       "Client"[1] AS client_id,
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
} = {}): Promise<GatewayRuleSuggestionRow[]> {
  const sql = getSql();
  const params: unknown[] = [];
  const where = [
    `"Gateway preventability" = 'PREVENTABLE_BY_GATEWAY'`,
    `"Gateway rule suggestion" IS NOT NULL`,
  ];

  if (input.clientId) {
    params.push(input.clientId);
    where.push(`$${params.length} = ANY("Client")`);
  }

  params.push(input.limit ?? 20);
  const limitParam = params.length;

  return (await sql.query(
    `SELECT
       "Client"[1] AS client_id,
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
} = {}): Promise<InsuranceExposureRow[]> {
  const sql = getSql();
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
