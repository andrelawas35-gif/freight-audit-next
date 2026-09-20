/**
 * evaluator-types.ts — Shared type definitions mirroring lib/intelligence/policy-evaluator.ts.
 *
 * The Gateway service is shelved (not launch-scoped). When activated, the
 * actual evaluatePolicyContext() function should be imported from a shared
 * workspace package rather than inlined here.
 *
 * These types are kept in sync manually with the canonical source:
 *   lib/intelligence/policy-evaluator.ts
 *
 * FROZEN (contracts-v1). Additive changes only.
 */

// ── From lib/intelligence/taxonomy.ts ────────────────────────────────

export const GATEWAY_ACTIONS = [
  'ALLOW',
  'WARN',
  'BLOCK',
  'REQUIRE_APPROVAL',
  'REQUIRE_DOCUMENTATION',
] as const;

export type GatewayAction = typeof GATEWAY_ACTIONS[number];

// ── From lib/intelligence/policy-evaluator.ts ────────────────────────

export type PolicyCondition = {
  declaredValueGte?: number;
  declaredValueGt?: number;
  declaredValueLte?: number;
  insuredValueLtDeclared?: boolean;
  carrierIn?: string[];
  carrierNotIn?: string[];
  serviceIn?: string[];
  serviceNotIn?: string[];
  shipperVertical?: string | string[];
  commodityType?: string;
  commodityIn?: string[];
  destinationCountryIn?: string[];
  destinationZipIn?: string[];
  destinationRiskTierIn?: string[];
  signatureRequiredAbove?: number;
  signatureTypeIn?: string[];
  documentationRequired?: string[];
  packageTypeIn?: string[];
  temperatureControlRequired?: boolean;
  temperatureMax?: number;
};

export type PolicyAction = {
  decision: GatewayAction;
  message: string;
  suggestedFix?: string;
  preventableLoss?: number;
  uninsuredExposure?: number;
};

export type ShipmentPolicyContext = {
  clientId: string;
  shipmentId?: string | null;
  invoiceId?: string | null;
  auditResultId?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
  destinationZip?: string | null;
  destinationCountry?: string | null;
  destinationRiskTier?: string | null;
  shipperVertical?: string | null;
  commodityType?: string | null;
  declaredValue?: number | null;
  insuredValue?: number | null;
  insuranceProvider?: string | null;
  signatureType?: string | null;
  packageType?: string | null;
  documentationReceived?: string[] | null;
  preventableLoss?: number | null;
  uninsuredExposure?: number | null;
  temperatureServiceSelected?: boolean | null;
  temperature?: number | null;
};

export type PolicyRuleForEvaluation = {
  id: string;
  clientId: string;
  rulesetId: string;
  ruleKey: string;
  category: string;
  conditionJson: PolicyCondition;
  actionJson: PolicyAction;
  severity: 'info' | 'warn' | 'block';
  status: 'draft' | 'client_attested' | 'active' | 'archived';
  clauseRef: string | null;
};

export type PolicyDecision = {
  decision: GatewayAction;
  ruleId: string | null;
  ruleKey: string;
  category: string;
  message: string;
  clauseRef?: string;
  suggestedFix?: string;
  confidence: number;
  preventableLoss: number;
  uninsuredExposure: number;
};

/**
 * Stub — the actual evaluator lives in lib/intelligence/policy-evaluator.ts.
 * When the Gateway is activated as a standalone service, either:
 *   a) Extract evaluatePolicyContext into a shared @aurelian/shared workspace package, or
 *   b) Vendor the evaluator logic into this service.
 *
 * For now, the Gateway runs in-process via app/api/v1/precheck/route.ts.
 * This Fastify service is shelved (ADR 0016, not launch-scoped).
 */
export function evaluatePolicyContext(_input: {
  context: ShipmentPolicyContext;
  rules: PolicyRuleForEvaluation[];
  mode?: 'backtest' | 'pre_shipment';
  includeDraft?: boolean;
}): PolicyDecision[] {
  throw new Error(
    'Gateway Fastify service is shelved. Use the in-process route: POST /api/v1/precheck',
  );
}
