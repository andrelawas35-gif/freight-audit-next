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

/** Code mapping lifecycle statuses for ingestion_exceptions (Q11 grilling). */
export const CODE_MAPPING_STATUSES = [
  'open',            // Unmapped, not yet reviewed
  'ai_proposed',     // Data clerk AI has suggested a mapping
  'human_confirmed', // Analyst has confirmed the AI proposal
  'learned',         // Confirmed mapping written to learned_mappings, exception resolved
] as const;

export type CodeMappingStatus = typeof CODE_MAPPING_STATUSES[number];

/** Source of a gateway tag: rule default, human-confirmed, AI-proposed, or client-defined. */
export const GATEWAY_SIGNAL_SOURCES = [
  'RULE_DEFAULT',
  'ANALYST_REVIEW',
  'AI_SUGGESTED',
  'CLIENT_DEFINED',
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

  // ── Explicit rule-code → tag mapping ──────────────────────────────
  // Every current rule code has an explicit entry. A missing key is a
  // structural error (failed lookup), not a silent UNKNOWN fallthrough.
  // This catches a future revenue-bearing rule shipped without a taxonomy
  // mapping — the guard that suite 1's rule-code-registry test enforces.
  const entry = GATEWAY_TAG_MAP[ruleCode];
  if (!entry) {
    throw new Error(
      `[taxonomy] No gateway tag mapping for rule code "${ruleCode}". ` +
      `Add an entry to GATEWAY_TAG_MAP before deploying this rule.`,
    );
  }

  const tag: GatewayTag = {
    gatewayPreventability: entry.preventability,
    gatewayCategory: entry.category,
    gatewayRuleSuggestion: entry.suggestion ?? null,
    gatewayEstimatedSavings: entry.hasSavings ? savings : 0,
    gatewayConfidence: entry.confidence,
    gatewaySignalSource: 'RULE_DEFAULT',
  };

  return validateGatewayTag(tag);
}

/** Per-rule-code taxonomy entry. */
type TaxonomyEntry = {
  preventability: GatewayPreventability;
  category: typeof GATEWAY_CATEGORIES[number];
  suggestion: string | null;
  hasSavings: boolean;
  confidence: number;
};

/**
 * Explicit rule-code → taxonomy mapping.
 *
 * Adding a rule code without an entry here is a build-time / lookup error,
 * not a silent `default` fallthrough.  The heavy-testing suite 1 rule-code-
 * registry guard asserts every active rule code has an entry.
 */
const GATEWAY_TAG_MAP: Record<string, TaxonomyEntry> = {
  DIM_WEIGHT_TRAP: {
    preventability: 'PREVENTABLE_BY_GATEWAY',
    category: 'DIM_WEIGHT_PADDING',
    suggestion: 'Warn or block when selected package cube is excessive for item weight/profile before label purchase.',
    hasSavings: true,
    confidence: 0.85,
  },
  PHANTOM_ACCESSORIAL: {
    preventability: 'PREVENTABLE_BY_GATEWAY',
    category: 'ADDRESS_VALIDATION',
    suggestion: 'Validate address type and waived accessorial rules before carrier/service selection.',
    hasSavings: true,
    confidence: 0.8,
  },
  SLA_FAILURE: {
    preventability: 'NON_PREVENTABLE_BY_GATEWAY',
    category: 'LATE_SHIPMENT_RISK',
    suggestion: null,
    hasSavings: false,
    confidence: 0.65,
  },
  LTL_SLA_FAILURE: {
    preventability: 'NON_PREVENTABLE_BY_GATEWAY',
    category: 'LATE_SHIPMENT_RISK',
    suggestion: null,
    hasSavings: false,
    confidence: 0.65,
  },
  TPL_GHOST_SHIPMENT: {
    preventability: 'PREVENTABLE_BY_GATEWAY',
    category: 'THREE_PL_PICK_PACK_ERROR',
    suggestion: 'Block 3PL fulfillment billing when no matching client order or shipment exists.',
    hasSavings: true,
    confidence: 0.75,
  },
  TPL_DUPLICATE: {
    preventability: 'PREVENTABLE_BY_GATEWAY',
    category: 'DUPLICATE_ORDER_FLOW',
    suggestion: 'Block duplicate order/fulfillment billing across invoice cycles unless manually approved.',
    hasSavings: true,
    confidence: 0.8,
  },
  TPL_DATA_REQUIRED: {
    preventability: 'PREVENTABLE_BY_GATEWAY',
    category: 'DATA_REQUIRED',
    suggestion: 'Require underlying carrier invoice or base-cost evidence before approving cost-plus 3PL freight charges.',
    hasSavings: false,
    confidence: 0.7,
  },
  TPL_PACKAGING: {
    preventability: 'UNKNOWN',
    category: 'BOX_SIZE_MISMATCH',
    suggestion: null,
    hasSavings: false,
    confidence: 0.45,
  },
  TPL_PICK_FEE: {
    preventability: 'NON_PREVENTABLE_BY_GATEWAY',
    category: 'CONTRACT_RATE_ERROR',
    suggestion: null,
    hasSavings: false,
    confidence: 0.7,
  },
  TPL_FREIGHT_MARKUP: {
    preventability: 'NON_PREVENTABLE_BY_GATEWAY',
    category: 'CONTRACT_RATE_ERROR',
    suggestion: null,
    hasSavings: false,
    confidence: 0.7,
  },
  TPL_STORAGE: {
    preventability: 'NON_PREVENTABLE_BY_GATEWAY',
    category: 'STORAGE_PROCESS_ERROR',
    suggestion: null,
    hasSavings: false,
    confidence: 0.7,
  },
  DUPLICATE_TRACKING: {
    preventability: 'UNKNOWN',
    category: 'CARRIER_BILLING_GLITCH',
    suggestion: null,
    hasSavings: false,
    confidence: 0.45,
  },
};

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
