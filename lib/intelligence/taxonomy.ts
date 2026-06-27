/**
 * Policy Intelligence Taxonomy — canonical enums for the gateway and insurance layers.
 *
 * SINGLE SOURCE OF TRUTH (03-taxonomy.md). If this file and the doc disagree,
 * this file wins and the doc is the bug. Do not duplicate these lists elsewhere.
 *
 * FROZEN (contracts-v1). New enum values are additive changes via Change Request.
 */

/** Gateway preventability classification for audit findings (CLAUDE.md inv. 7). */
export const GATEWAY_PREVENTABILITY = [
  'PREVENTABLE_BY_GATEWAY',
  'NON_PREVENTABLE_BY_GATEWAY',
  'UNKNOWN',
] as const;

export type GatewayPreventability = typeof GATEWAY_PREVENTABILITY[number];

/** Behavioral categories for preventable-loss mapping (15 core categories). */
export const GATEWAY_CATEGORIES = [
  'DIM_WEIGHT_PADDING',
  'BOX_SIZE_MISMATCH',
  'WRONG_SERVICE_LEVEL',
  'ADDRESS_VALIDATION',
  'RESIDENTIAL_FLAG',
  'CARRIER_SELECTION',
  'ACCESSORIAL_AVOIDABLE',
  'LATE_SHIPMENT_RISK',
  'DUPLICATE_ORDER_FLOW',
  'THREE_PL_PICK_PACK_ERROR',
  'STORAGE_PROCESS_ERROR',
  'CARRIER_BILLING_GLITCH',
  'FUEL_SURCHARGE_ERROR',
  'CONTRACT_RATE_ERROR',
  'DATA_REQUIRED',
] as const;

export type GatewayCategory = typeof GATEWAY_CATEGORIES[number];

/** Source of a gateway tag: rule default, human-confirmed, or AI-proposed. */
export const GATEWAY_SIGNAL_SOURCES = [
  'RULE_DEFAULT',
  'ANALYST_REVIEW',
  'AI_SUGGESTED',
] as const;

export type GatewaySignalSource = typeof GATEWAY_SIGNAL_SOURCES[number];

/** Gateway enforcement actions: advisory (ALLOW, WARN) through enforcement (BLOCK, REQUIRE_*). */
export const GATEWAY_ACTIONS = [
  'ALLOW',
  'WARN',
  'BLOCK',
  'REQUIRE_APPROVAL',
  'REQUIRE_DOCUMENTATION',
] as const;

export type GatewayAction = typeof GATEWAY_ACTIONS[number];

/** High-value shipper verticals (jewelry-first, built vertical-agnostic per 03-taxonomy.md). */
export const HIGH_VALUE_VERTICALS = [
  'jewelry',
  'fine_art',
  'luxury_goods',
  'electronics',
  'pharma',
  'medical_device',
  'precious_metals',
  'regulated_goods',
  'wine_spirits',
  'aerospace_parts',
  'event_equipment',
  'sensitive_documents',
  'other',
] as const;

export type HighValueVertical = typeof HIGH_VALUE_VERTICALS[number];

/** Insurance risk categories for high-value shippers (21 categories, 03-taxonomy.md). */
export const INSURANCE_RISK_CATEGORIES = [
  'DECLARED_VALUE_MISMATCH',
  'UNDER_INSURED_SHIPMENT',
  'OVER_INSURED_SHIPMENT',
  'EXCLUDED_COMMODITY',
  'INVALID_CARRIER_SERVICE',
  'MISSING_SIGNATURE_REQUIRED',
  'HIGH_RISK_DESTINATION',
  'PACKAGING_NON_COMPLIANT',
  'CHAIN_OF_CUSTODY_GAP',
  'POLICY_LIMIT_EXCEEDED',
  'CLAIM_WINDOW_RISK',
  'THIRD_PARTY_INSURANCE_REQUIRED',
  'CARRIER_DECLARED_VALUE_NOT_ALLOWED',
  'DOCUMENTATION_MISSING',
  'APPRAISAL_REQUIRED',
  'SERIAL_NUMBER_REQUIRED',
  'TEMPERATURE_CONTROL_MISSING',
  'REGULATED_ITEM_NON_COMPLIANT',
  'DESTINATION_RESTRICTED',
  'APPROVED_CARRIER_REQUIRED',
  'APPROVED_SERVICE_REQUIRED',
] as const;

export type InsuranceRiskCategory = typeof INSURANCE_RISK_CATEGORIES[number];

export type GatewayTag = {
  gatewayPreventability: GatewayPreventability;
  gatewayCategory: GatewayCategory;
  gatewayRuleSuggestion: string | null;
  gatewayEstimatedSavings: number;
  gatewayConfidence: number;
  gatewaySignalSource: GatewaySignalSource;
};

export function validateGatewayTag(tag: GatewayTag): GatewayTag {
  if (
    tag.gatewayPreventability === 'PREVENTABLE_BY_GATEWAY' &&
    !tag.gatewayRuleSuggestion?.trim()
  ) {
    throw new Error('PREVENTABLE_BY_GATEWAY findings require a gateway rule suggestion.');
  }

  if (tag.gatewayConfidence < 0 || tag.gatewayConfidence > 1) {
    throw new Error('Gateway confidence must be between 0 and 1.');
  }

  if (tag.gatewayEstimatedSavings < 0) {
    throw new Error('Gateway estimated savings cannot be negative.');
  }

  return tag;
}

export function defaultGatewayTagForRule(ruleCode: string, variance: number): GatewayTag {
  const savings = Math.max(0, variance);

  switch (ruleCode) {
    case 'DIM_WEIGHT_TRAP':
      return validateGatewayTag({
        gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'DIM_WEIGHT_PADDING',
        gatewayRuleSuggestion: 'Warn or block when selected package cube is excessive for item weight/profile before label purchase.',
        gatewayEstimatedSavings: savings,
        gatewayConfidence: 0.85,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'PHANTOM_ACCESSORIAL':
      return validateGatewayTag({
        gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'ADDRESS_VALIDATION',
        gatewayRuleSuggestion: 'Validate address type and waived accessorial rules before carrier/service selection.',
        gatewayEstimatedSavings: savings,
        gatewayConfidence: 0.8,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'SLA_FAILURE':
    case 'LTL_SLA_FAILURE':
      return validateGatewayTag({
        gatewayPreventability: 'NON_PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'LATE_SHIPMENT_RISK',
        gatewayRuleSuggestion: null,
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.65,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'TPL_GHOST_SHIPMENT':
      return validateGatewayTag({
        gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'THREE_PL_PICK_PACK_ERROR',
        gatewayRuleSuggestion: 'Block 3PL fulfillment billing when no matching client order or shipment exists.',
        gatewayEstimatedSavings: savings,
        gatewayConfidence: 0.75,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'TPL_DUPLICATE':
      return validateGatewayTag({
        gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'DUPLICATE_ORDER_FLOW',
        gatewayRuleSuggestion: 'Block duplicate order/fulfillment billing across invoice cycles unless manually approved.',
        gatewayEstimatedSavings: savings,
        gatewayConfidence: 0.8,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'TPL_DATA_REQUIRED':
      return validateGatewayTag({
        gatewayPreventability: 'PREVENTABLE_BY_GATEWAY',
        gatewayCategory: 'DATA_REQUIRED',
        gatewayRuleSuggestion: 'Require underlying carrier invoice or base-cost evidence before approving cost-plus 3PL freight charges.',
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.7,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'TPL_PACKAGING':
      return validateGatewayTag({
        gatewayPreventability: 'UNKNOWN',
        gatewayCategory: 'BOX_SIZE_MISMATCH',
        gatewayRuleSuggestion: null,
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.45,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'TPL_PICK_FEE':
    case 'TPL_FREIGHT_MARKUP':
    case 'TPL_STORAGE':
      return validateGatewayTag({
        gatewayPreventability: 'NON_PREVENTABLE_BY_GATEWAY',
        gatewayCategory: ruleCode === 'TPL_STORAGE' ? 'STORAGE_PROCESS_ERROR' : 'CONTRACT_RATE_ERROR',
        gatewayRuleSuggestion: null,
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.7,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    case 'DUPLICATE_TRACKING':
      return validateGatewayTag({
        gatewayPreventability: 'UNKNOWN',
        gatewayCategory: 'CARRIER_BILLING_GLITCH',
        gatewayRuleSuggestion: null,
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.45,
        gatewaySignalSource: 'RULE_DEFAULT',
      });

    default:
      return validateGatewayTag({
        gatewayPreventability: 'UNKNOWN',
        gatewayCategory: 'DATA_REQUIRED',
        gatewayRuleSuggestion: null,
        gatewayEstimatedSavings: 0,
        gatewayConfidence: 0.25,
        gatewaySignalSource: 'RULE_DEFAULT',
      });
  }
}

export function gatewayTagToFields(tag: GatewayTag): Record<string, unknown> {
  const validated = validateGatewayTag(tag);
  return {
    'Gateway preventability': validated.gatewayPreventability,
    'Gateway category': validated.gatewayCategory,
    'Gateway rule suggestion': validated.gatewayRuleSuggestion,
    'Gateway estimated savings': validated.gatewayEstimatedSavings,
    'Gateway confidence': validated.gatewayConfidence,
    'Gateway signal source': validated.gatewaySignalSource,
  };
}
