/**
 * Policy Evaluator — deterministic rule-matching engine.
 *
 * This is the CORE EVALUATOR CONTRACT (CONTRACTS.md §2). It is pure,
 * synchronous, and deterministic — no I/O, no LLM, no RAG (ADR 0003).
 *
 * Two modes from the same code:
 *   - `backtest`: historical gap analysis against past shipments
 *   - `pre_shipment`: future gateway precheck (POST /v1/precheck)
 *
 * Default-allow: if no rule matches, return ALLOW.
 * Unknown ≠ compliant: null inputs evaluate to unknown, not pass/fail.
 *
 * FROZEN (contracts-v1). Additive changes only via Change Request → Controller → E1.
 */

import { GATEWAY_ACTIONS, type GatewayAction } from './taxonomy';

/** Valid policy document types (01-ingestion.md). */
export const POLICY_TYPES = [
  'carrier_contract',
  'carrier_tariff',
  '3pl_sla',
  'insurance_policy',
  'claims_policy',
  'shipping_sop',
  'packaging_standard',
  'email_exception',
] as const;

export type PolicyType = typeof POLICY_TYPES[number];

/** Policy lifecycle states. */
export const POLICY_STATUSES = ['draft', 'client_attested', 'active', 'archived'] as const;
export type PolicyStatus = typeof POLICY_STATUSES[number];

/** Document extraction pipeline states. */
export const POLICY_DOCUMENT_STATUSES = [
  'not_started',
  'extracted',
  'needs_review',
  'reviewed',
] as const;

export type PolicyDocumentStatus = typeof POLICY_DOCUMENT_STATUSES[number];

/**
 * Declarative IF logic for a single policy rule.
 * Every specified key must match (AND semantics). Null context fields
 * fail individual checks — an unknown value is not a pass.
 *
 * FROZEN (contracts-v1). New keys require a Change Request to E1.
 */
export type PolicyCondition = {
  /** Declared value >= threshold (cents or dollars — unit-consistent) */
  declaredValueGte?: number;
  /** Declared value > threshold */
  declaredValueGt?: number;
  /** Declared value <= threshold */
  declaredValueLte?: number;
  /** Insured value is less than declared value (under-insured) */
  insuredValueLtDeclared?: boolean;
  /** Carrier SCAC or name is in this list */
  carrierIn?: string[];
  /** Carrier SCAC or name is NOT in this list */
  carrierNotIn?: string[];
  /** Service level code is in this list */
  serviceIn?: string[];
  /** Service level code is NOT in this list */
  serviceNotIn?: string[];
  /** Shipper vertical matches (string or array for multi-match) */
  shipperVertical?: string | string[];
  /** Exact commodity type match */
  commodityType?: string;
  /** Commodity type is in this list */
  commodityIn?: string[];
  /** Destination country code is in this list */
  destinationCountryIn?: string[];
  /** Destination zip prefix is in this list */
  destinationZipIn?: string[];
  /** Destination risk tier is in this list */
  destinationRiskTierIn?: string[];
  /** Signature required when declared value >= this threshold */
  signatureRequiredAbove?: number;
  /** Required signature type is in this list */
  signatureTypeIn?: string[];
  /** At least one of these documents is missing */
  documentationRequired?: string[];
  /** Package type is in this list */
  packageTypeIn?: string[];
  /** Temperature control is required (cold chain, perishable, pharma) */
  temperatureControlRequired?: boolean;
  /** Maximum temperature allowed (e.g., 40°F for pharma cold chain) */
  temperatureMax?: number;
};

/** THEN action for a matched rule. Decision is validated against GATEWAY_ACTIONS. */
export type PolicyAction = {
  decision: GatewayAction;
  message: string;
  suggestedFix?: string;
  preventableLoss?: number;
  uninsuredExposure?: number;
};

/**
 * The shipment-like payload for evaluation.
 * Built from the shipment spine (ADR 0001): "Shipments" ← "Invoices" ← "Audit Results"
 * plus insurance audit results. One context per shipment.
 */
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
  /** Aggregated preventable financial loss from linked audit findings */
  preventableLoss?: number | null;
  /** Aggregated uninsured exposure from linked insurance findings */
  uninsuredExposure?: number | null;
  /** Whether a temperature-controlled service was selected (cold chain) */
  temperatureServiceSelected?: boolean | null;
  /** Ambient temperature at time of shipment (°F), if tracked */
  temperature?: number | null;
};

/** A policy rule ready for evaluation (DB row joined + parsed). */
export type PolicyRuleForEvaluation = {
  id: string;
  clientId: string;
  rulesetId: string;
  ruleKey: string;
  category: string;
  conditionJson: PolicyCondition;
  actionJson: PolicyAction;
  severity: 'info' | 'warn' | 'block';
  status: PolicyStatus;
  clauseRef: string | null;
};

/** One decision produced by evaluatePolicyContext. */
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

export function evaluatePolicyContext(input: {
  context: ShipmentPolicyContext;
  rules: PolicyRuleForEvaluation[];
  mode?: 'backtest' | 'pre_shipment';
  includeDraft?: boolean;
}): PolicyDecision[] {
  const decisions = input.rules
    .filter((rule) => rule.clientId === input.context.clientId)
    .filter((rule) => rule.status === 'active' || (input.includeDraft && rule.status === 'draft'))
    .filter((rule) => matchesCondition(input.context, rule.conditionJson))
    .map((rule) => decisionFromRule(rule, input.context));

  if (decisions.length > 0) return decisions;

  return [{
    decision: 'ALLOW',
    ruleId: null,
    ruleKey: 'default_allow',
    category: 'COMPLIANT',
    message: 'No active policy rule matched this shipment context.',
    confidence: 1,
    preventableLoss: 0,
    uninsuredExposure: 0,
  }];
}

export function matchesCondition(context: ShipmentPolicyContext, condition: PolicyCondition): boolean {
  const checks: boolean[] = [];

  if (condition.declaredValueGte !== undefined) {
    checks.push(num(context.declaredValue) >= condition.declaredValueGte);
  }
  if (condition.declaredValueGt !== undefined) {
    checks.push(num(context.declaredValue) > condition.declaredValueGt);
  }
  if (condition.declaredValueLte !== undefined) {
    checks.push(num(context.declaredValue) <= condition.declaredValueLte);
  }
  if (condition.insuredValueLtDeclared) {
    checks.push(num(context.insuredValue) < num(context.declaredValue));
  }
  if (condition.carrierIn?.length) {
    checks.push(inList(context.carrier, condition.carrierIn));
  }
  if (condition.carrierNotIn?.length) {
    checks.push(!inList(context.carrier, condition.carrierNotIn));
  }
  if (condition.serviceIn?.length) {
    checks.push(inList(context.serviceLevel, condition.serviceIn));
  }
  if (condition.serviceNotIn?.length) {
    checks.push(!inList(context.serviceLevel, condition.serviceNotIn));
  }
  if (condition.shipperVertical !== undefined) {
    checks.push(Array.isArray(condition.shipperVertical)
      ? inList(context.shipperVertical, condition.shipperVertical)
      : eq(context.shipperVertical, condition.shipperVertical));
  }
  if (condition.commodityType !== undefined) {
    checks.push(eq(context.commodityType, condition.commodityType));
  }
  if (condition.commodityIn?.length) {
    checks.push(inList(context.commodityType, condition.commodityIn));
  }
  if (condition.destinationCountryIn?.length) {
    checks.push(inList(context.destinationCountry, condition.destinationCountryIn));
  }
  if (condition.destinationZipIn?.length) {
    checks.push(inList(context.destinationZip, condition.destinationZipIn));
  }
  if (condition.destinationRiskTierIn?.length) {
    checks.push(inList(context.destinationRiskTier, condition.destinationRiskTierIn));
  }
  if (condition.signatureRequiredAbove !== undefined) {
    const sig = normalize(context.signatureType);
    checks.push(num(context.declaredValue) >= condition.signatureRequiredAbove && (!sig || sig === 'none'));
  }
  if (condition.signatureTypeIn?.length) {
    checks.push(inList(context.signatureType, condition.signatureTypeIn));
  }
  if (condition.documentationRequired?.length) {
    const received = new Set((context.documentationReceived ?? []).map(normalize));
    checks.push(condition.documentationRequired.some((doc) => !received.has(normalize(doc))));
  }
  if (condition.packageTypeIn?.length) {
    checks.push(inList(context.packageType, condition.packageTypeIn));
  }
  if (condition.temperatureControlRequired) {
    // Rule fires when temp control is required but shipment lacks it (null → fail closed)
    checks.push(context.temperatureServiceSelected !== true);
  }
  if (condition.temperatureMax !== undefined) {
    // num(null) = 0 → 0 > max is false → safe without explicit null guard
    checks.push(num(context.temperature) > condition.temperatureMax);
  }

  return checks.length > 0 && checks.every(Boolean);
}

function decisionFromRule(rule: PolicyRuleForEvaluation, context: ShipmentPolicyContext): PolicyDecision {
  const action = rule.actionJson;
  const decision = GATEWAY_ACTIONS.includes(action.decision) ? action.decision : severityDecision(rule.severity);

  return {
    decision,
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    category: rule.category,
    message: action.message || `${rule.ruleKey} matched this shipment context.`,
    clauseRef: rule.clauseRef ?? undefined,
    suggestedFix: action.suggestedFix,
    confidence: 0.85,
    preventableLoss: Math.max(0, action.preventableLoss ?? context.preventableLoss ?? 0),
    uninsuredExposure: Math.max(0, action.uninsuredExposure ?? context.uninsuredExposure ?? 0),
  };
}

function severityDecision(severity: string): GatewayAction {
  if (severity === 'block') return 'BLOCK';
  if (severity === 'info') return 'WARN';
  return 'WARN';
}

function num(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function inList(value: string | null | undefined, allowed: string[]) {
  const n = normalize(value);
  return allowed.map(normalize).includes(n);
}

function eq(a: string | null | undefined, b: string) {
  return normalize(a) === normalize(b);
}

function normalize(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}
