/**
 * T1 Deterministic Tokenizer — phrase/pattern matching for insurance clauses.
 *
 * ADR 0012 D2: Pure function, no API calls, no async I/O, no database reads.
 * Takes clause text → returns matched rule_key + extracted parameters or null.
 *
 * Seeded from the existing PolicyCondition key namespace. Each rule_key has
 * 2–5 phrase patterns covering common insurance policy language. Parameters
 * (dollar amounts, carrier names, thresholds) are extracted via capture groups.
 *
 * COLLISION RESOLUTION: longer pattern match wins (specificity). Exact match
 * beats partial. If two patterns of equal length match, the first registered
 * wins (deterministic tiebreak).
 *
 * Cost: $0. Latency: <5ms per clause. Zero API dependencies.
 */

import type { PolicyCondition, PolicyAction } from './policy-evaluator';

// ── Public types ──────────────────────────────────────────────────────

/** Return all rule_keys the T1 tokenizer can already identify.
 *  Used by the T3→T1 feedback loop to avoid suggesting patterns that already exist. */
export function getKnownRuleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const p of PATTERNS) keys.add(p.ruleKey);
  return keys;
}

export type TokenizerHit = {
  /** The matched rule_key (machine-safe slug) */
  ruleKey: string;
  /** The insurance risk category this pattern falls under */
  category: string;
  /** Partial PolicyCondition extracted from parameter captures */
  conditionFragment: Partial<PolicyCondition>;
  /** Suggested action for the draft rule */
  actionFragment: Partial<PolicyAction>;
  /** Confidence score for this match (0–1) */
  confidence: number;
  /** Name of the matched pattern (for diagnostics) */
  patternName: string;
  /** The matched text substring (for UI highlight) */
  matchedText: string;
};

// ── Internal pattern type ─────────────────────────────────────────────

/**
 * Capture group convention (indexed, no named groups — target is ES2017):
 *   m[1] = amount   (dollar figure)
 *   m[1] = carrier  (carrier name)
 *   m[1] = service  (service level name)
 *   m[1] = country  (country name)
 *   m[1] = package  (package type)
 *   m[1] = commodity (commodity name)
 */
type TokenizerPattern = {
  name: string;
  ruleKey: string;
  category: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Partial<PolicyCondition>;
  action: Partial<PolicyAction>;
  confidence: number;
};

// ── Helpers ───────────────────────────────────────────────────────────

function parseDollars(raw: string): number {
  return Number(raw.replace(/[$,]/g, '').trim());
}

function normalizeCarrier(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const aliases: Record<string, string> = {
    FEDEX: 'FedEx', 'FEDEX EXPRESS': 'FedEx', 'FEDERAL EXPRESS': 'FedEx',
    FEDEXFREIGHT: 'FedEx', 'FEDEX GROUND': 'FedEx', UPS: 'UPS', 'UNITED PARCEL SERVICE': 'UPS',
    USPS: 'USPS', 'U.S. POSTAL SERVICE': 'USPS',
    'UNITED STATES POSTAL SERVICE': 'USPS', DHL: 'DHL', 'DHL EXPRESS': 'DHL',
    TFORCE: 'TForce', 'T-FORCE': 'TForce', 'T FORCE': 'TForce',
    OLD_DOMINION: 'Old Dominion', 'OLD DOMINION': 'Old Dominion', ODFL: 'Old Dominion',
    SAIA: 'Saia', XPO: 'XPO', 'XPO LOGISTICS': 'XPO',
    ESTES: 'Estes', 'ESTES EXPRESS': 'Estes',
    RL_CARRIERS: 'R+L', 'R&L': 'R+L', 'R+L CARRIERS': 'R+L',
    SOUTHEASTERN: 'Southeastern',
  };
  return aliases[upper] ?? raw.trim();
}

function one<T>(value: T): T[] {
  return [value];
}

// ── Pattern Table ─────────────────────────────────────────────────────

const PATTERNS: TokenizerPattern[] = [
  // ═══ DECLARED VALUE LIMITS ═══

  {
    name: 'declared_value_shall_not_exceed',
    ruleKey: 'declared_value_limit',
    category: 'DECLARED_VALUE_MISMATCH',
    regex: /declared\s+value\s+shall\s+not\s+exceed\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({ declaredValueLte: parseDollars(m[1]) }),
    action: { decision: 'BLOCK', message: 'Declared value exceeds policy limit.' },
    confidence: 0.95,
  },
  {
    name: 'maximum_declared_value_of',
    ruleKey: 'declared_value_limit',
    category: 'DECLARED_VALUE_MISMATCH',
    regex: /maximum\s+declared\s+value\s+of\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({ declaredValueLte: parseDollars(m[1]) }),
    action: { decision: 'BLOCK', message: 'Declared value exceeds maximum.' },
    confidence: 0.95,
  },
  {
    name: 'shipments_valued_over_require',
    ruleKey: 'declared_value_threshold_action',
    category: 'DECLARED_VALUE_MISMATCH',
    regex: /shipments?\s+valued\s+over\s+(\$[\d,]+(?:\.\d{2})?)\s+require/i,
    extract: (m) => ({ declaredValueGt: parseDollars(m[1]) }),
    action: { decision: 'WARN', message: 'Shipment value exceeds policy threshold.' },
    confidence: 0.88,
  },
  {
    name: 'shipments_valued_at_least',
    ruleKey: 'declared_value_minimum',
    category: 'DECLARED_VALUE_MISMATCH',
    regex: /shipments?\s+valued\s+at\s+least\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({ declaredValueGte: parseDollars(m[1]) }),
    action: { decision: 'WARN', message: 'Shipment value below policy minimum for this rule.' },
    confidence: 0.85,
  },
  {
    name: 'minimum_declared_value',
    ruleKey: 'declared_value_minimum',
    category: 'DECLARED_VALUE_MISMATCH',
    regex: /minimum\s+declared\s+value\s+(?:of|is)\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({ declaredValueGte: parseDollars(m[1]) }),
    action: { decision: 'WARN', message: 'Declared value below policy minimum.' },
    confidence: 0.92,
  },

  // ═══ SIGNATURE REQUIREMENTS ═══

  {
    name: 'signature_required_for_shipments_over',
    ruleKey: 'signature_above_threshold',
    category: 'MISSING_SIGNATURE_REQUIRED',
    regex: /signature\s+required\s+for\s+(?:all\s+)?shipments?\s+over\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({ signatureRequiredAbove: parseDollars(m[1]) }),
    action: { decision: 'BLOCK', message: 'Signature required for this shipment value.' },
    confidence: 0.95,
  },
  {
    name: 'adult_signature_required',
    ruleKey: 'signature_type',
    category: 'MISSING_SIGNATURE_REQUIRED',
    regex: /adult\s+signature\s+required/i,
    extract: () => ({ signatureTypeIn: ['adult_direct', 'adult'] }),
    action: { decision: 'BLOCK', message: 'Adult signature required.' },
    confidence: 0.90,
  },
  {
    name: 'direct_signature_required',
    ruleKey: 'signature_type',
    category: 'MISSING_SIGNATURE_REQUIRED',
    regex: /direct\s+signature\s+required/i,
    extract: () => ({ signatureTypeIn: one('direct') }),
    action: { decision: 'BLOCK', message: 'Direct signature required.' },
    confidence: 0.90,
  },
  {
    name: 'indirect_signature_permitted',
    ruleKey: 'signature_type',
    category: 'MISSING_SIGNATURE_REQUIRED',
    regex: /indirect\s+signature\s+(?:is\s+)?permitted/i,
    extract: () => ({ signatureTypeIn: one('indirect') }),
    action: { decision: 'ALLOW', message: 'Indirect signature is sufficient.' },
    confidence: 0.85,
  },
  {
    name: 'adult_signature_above_threshold',
    ruleKey: 'signature_above_threshold',
    category: 'MISSING_SIGNATURE_REQUIRED',
    regex: /adult\s+signature\s+(?:required\s+)?(?:for\s+)?(?:\w+\s+)*shipments?\s+(?:over|above)\s+(\$[\d,]+(?:\.\d{2})?)/i,
    extract: (m) => ({
      signatureRequiredAbove: parseDollars(m[1]),
      signatureTypeIn: one('adult_direct'),
    }),
    action: { decision: 'BLOCK', message: 'Adult signature required above threshold.' },
    confidence: 0.93,
  },

  // ═══ CARRIER RESTRICTIONS ═══

  {
    name: 'shall_not_be_shipped_via',
    ruleKey: 'carrier_excluded',
    category: 'APPROVED_CARRIER_REQUIRED',
    regex: /shall\s+not\s+be\s+shipped\s+via\s+([A-Z][A-Za-z\s&+]+?)(?:\.|$|,|\s+or\s|\s+unless)/i,
    extract: (m) => ({ carrierNotIn: one(normalizeCarrier(m[1])) }),
    action: { decision: 'BLOCK', message: 'Carrier not authorized for this shipment.' },
    confidence: 0.88,
  },
  {
    name: 'not_authorized_for_carrier',
    ruleKey: 'carrier_excluded',
    category: 'APPROVED_CARRIER_REQUIRED',
    regex: /not\s+authorized\s+for\s+([A-Z][A-Za-z\s&+]+?)(?:\.|$|,|\s+or\s|\s+unless|\s+shipments)/i,
    extract: (m) => ({ carrierNotIn: one(normalizeCarrier(m[1])) }),
    action: { decision: 'BLOCK', message: 'Carrier not authorized.' },
    confidence: 0.88,
  },
  {
    name: 'excluded_carrier_label',
    ruleKey: 'carrier_excluded',
    category: 'APPROVED_CARRIER_REQUIRED',
    regex: /excluded\s+carrier\s*:\s*([A-Z][A-Za-z\s&+]+?)(?:\.|$|,|\s+or\s)/i,
    extract: (m) => ({ carrierNotIn: one(normalizeCarrier(m[1])) }),
    action: { decision: 'BLOCK', message: 'Carrier is excluded.' },
    confidence: 0.90,
  },
  {
    name: 'must_be_shipped_via',
    ruleKey: 'carrier_required',
    category: 'APPROVED_CARRIER_REQUIRED',
    regex: /must\s+be\s+shipped\s+(?:via|through|using)\s+([A-Z][A-Za-z\s&+]+?)(?:\.|$|,)/i,
    extract: (m) => ({ carrierIn: one(normalizeCarrier(m[1])) }),
    action: { decision: 'BLOCK', message: 'Approved carrier required.' },
    confidence: 0.88,
  },
  {
    name: 'authorized_carriers_colon',
    ruleKey: 'carrier_required',
    category: 'APPROVED_CARRIER_REQUIRED',
    regex: /authorized\s+carriers?\s*:\s*([A-Z][A-Za-z\s&+]+?)(?:\.|$|,)/i,
    extract: (m) => ({ carrierIn: one(normalizeCarrier(m[1])) }),
    action: { decision: 'BLOCK', message: 'Only authorized carriers may be used.' },
    confidence: 0.85,
  },

  // ═══ SERVICE LEVEL RESTRICTIONS ═══

  {
    name: 'must_use_service',
    ruleKey: 'service_required',
    category: 'APPROVED_SERVICE_REQUIRED',
    regex: /must\s+(?:use|be\s+shipped\s+via)\s+([A-Z][A-Za-z0-9]+(?:\s*Day)?)\s+(?:service|shipping)/i,
    extract: (m) => ({ serviceIn: one(m[1].trim()) }),
    action: { decision: 'BLOCK', message: 'Required service level not selected.' },
    confidence: 0.85,
  },
  {
    name: 'ground_service_not_permitted',
    ruleKey: 'service_excluded',
    category: 'APPROVED_SERVICE_REQUIRED',
    regex: /ground\s+service\s+(?:is\s+)?not\s+permitted/i,
    extract: () => ({ serviceNotIn: one('Ground') }),
    action: { decision: 'BLOCK', message: 'Ground service is not permitted.' },
    confidence: 0.92,
  },
  {
    name: 'shall_not_use_service',
    ruleKey: 'service_excluded',
    category: 'APPROVED_SERVICE_REQUIRED',
    regex: /shall\s+not\s+use\s+([A-Z][A-Za-z0-9]+(?:\s*Day)?)\s+(?:service|shipping)/i,
    extract: (m) => ({ serviceNotIn: one(m[1].trim()) }),
    action: { decision: 'BLOCK', message: 'Service level not permitted.' },
    confidence: 0.88,
  },

  // ═══ TEMPERATURE CONTROL ═══

  {
    name: 'temperature_controlled_required',
    ruleKey: 'temperature_control',
    category: 'TEMPERATURE_CONTROL_MISSING',
    regex: /temperature[-\s]controlled\s+(?:shipping|transport|freight|service)/i,
    extract: () => ({ temperatureControlRequired: true }),
    action: { decision: 'BLOCK', message: 'Temperature-controlled service required.' },
    confidence: 0.93,
  },
  {
    name: 'cold_chain_required',
    ruleKey: 'temperature_control',
    category: 'TEMPERATURE_CONTROL_MISSING',
    regex: /cold[-\s]chain\s+(?:shipping|transport|logistics)\s+(?:is\s+)?required/i,
    extract: () => ({ temperatureControlRequired: true }),
    action: { decision: 'BLOCK', message: 'Cold chain shipping required.' },
    confidence: 0.93,
  },
  {
    name: 'perishable_temp_monitoring',
    ruleKey: 'temperature_control',
    category: 'TEMPERATURE_CONTROL_MISSING',
    regex: /perishable\s+(?:items?|goods?|shipments?)\s+(?:must\s+be\s+|shall\s+be\s+)(?:shipped|transported)\s+with\s+temperature\s+monitoring/i,
    extract: () => ({ temperatureControlRequired: true }),
    action: { decision: 'BLOCK', message: 'Perishable items require temperature monitoring.' },
    confidence: 0.90,
  },
  {
    name: 'refrigerated_transport_required',
    ruleKey: 'temperature_control',
    category: 'TEMPERATURE_CONTROL_MISSING',
    regex: /refrigerated\s+(?:transport|shipping|freight)\s+(?:is\s+)?required/i,
    extract: () => ({ temperatureControlRequired: true }),
    action: { decision: 'BLOCK', message: 'Refrigerated transport required.' },
    confidence: 0.93,
  },

  // ═══ DOCUMENTATION REQUIREMENTS ═══

  {
    name: 'certificate_of_insurance_required',
    ruleKey: 'documentation_required',
    category: 'DOCUMENTATION_MISSING',
    regex: /certificate\s+of\s+insurance\s+(?:is\s+)?required/i,
    extract: () => ({ documentationRequired: one('certificate_of_insurance') }),
    action: { decision: 'REQUIRE_DOCUMENTATION', message: 'Certificate of insurance required.' },
    confidence: 0.95,
  },
  {
    name: 'appraisal_required',
    ruleKey: 'documentation_required',
    category: 'APPRAISAL_REQUIRED',
    regex: /(?:independent\s+)?appraisal\s+(?:is\s+)?required/i,
    extract: () => ({ documentationRequired: one('appraisal') }),
    action: { decision: 'REQUIRE_DOCUMENTATION', message: 'Independent appraisal required.' },
    confidence: 0.93,
  },
  {
    name: 'serial_number_required',
    ruleKey: 'documentation_required',
    category: 'SERIAL_NUMBER_REQUIRED',
    regex: /serial\s+number(?:s)?\s+(?:must\s+be\s+|shall\s+be\s+|are\s+|is\s+)?required/i,
    extract: () => ({ documentationRequired: one('serial_number') }),
    action: { decision: 'REQUIRE_DOCUMENTATION', message: 'Serial number documentation required.' },
    confidence: 0.92,
  },

  // ═══ INSURANCE COVERAGE ═══

  {
    name: 'full_value_insurance_required',
    ruleKey: 'full_value_insurance',
    category: 'UNDER_INSURED_SHIPMENT',
    regex: /(?:must\s+be\s+|shall\s+be\s+)?insured\s+for\s+(?:the\s+)?full\s+(?:declared\s+)?value/i,
    extract: () => ({ insuredValueLtDeclared: true }),
    action: { decision: 'BLOCK', message: 'Shipment must be insured for full declared value.' },
    confidence: 0.90,
  },
  {
    name: 'third_party_insurance_required',
    ruleKey: 'third_party_insurance',
    category: 'THIRD_PARTY_INSURANCE_REQUIRED',
    regex: /third[-\s]party\s+insurance\s+(?:is\s+)?required/i,
    extract: () => ({ insuredValueLtDeclared: true }),
    action: { decision: 'BLOCK', message: 'Third-party insurance policy required.' },
    confidence: 0.90,
  },
  {
    name: 'shipper_must_maintain_cargo_insurance',
    ruleKey: 'third_party_insurance',
    category: 'THIRD_PARTY_INSURANCE_REQUIRED',
    regex: /shipper\s+must\s+maintain\s+(?:cargo|separate)(?:\s+\w+)*\s+insurance/i,
    extract: () => ({ insuredValueLtDeclared: true }),
    action: { decision: 'BLOCK', message: 'Shipper must maintain separate cargo insurance.' },
    confidence: 0.88,
  },

  // ═══ DESTINATION RESTRICTIONS ═══

  {
    name: 'high_risk_destination',
    ruleKey: 'destination_risk',
    category: 'HIGH_RISK_DESTINATION',
    regex: /high[-\s]risk\s+destinations?\s+(?:are\s+)?(?:prohibited|not\s+permitted|restricted)/i,
    extract: () => ({ destinationRiskTierIn: one('high') }),
    action: { decision: 'BLOCK', message: 'High-risk destination not permitted.' },
    confidence: 0.85,
  },
  {
    name: 'international_shipments_to',
    ruleKey: 'destination_country',
    category: 'DESTINATION_RESTRICTED',
    regex: /(?:international\s+)?shipments?\s+(?:to|destined\s+for)\s+([A-Z][A-Za-z\s]+?)(?:\.|$|,|\s+are|\s+must|\s+shall)/i,
    extract: (m) => ({ destinationCountryIn: one(m[1].trim()) }),
    action: { decision: 'WARN', message: 'Destination country has special requirements.' },
    confidence: 0.75,
  },

  // ═══ PACKAGING ═══

  {
    name: 'must_be_shipped_in_package_type',
    ruleKey: 'packaging_requirement',
    category: 'PACKAGING_NON_COMPLIANT',
    regex: /must\s+be\s+shipped\s+in\s+(?:a\s+)?([a-z\s]+(?:box|container|crate|envelope|pack))/i,
    extract: (m) => ({ packageTypeIn: one(m[1].trim()) }),
    action: { decision: 'BLOCK', message: 'Required packaging type not used.' },
    confidence: 0.82,
  },

  // ═══ SHIPPER VERTICAL ═══

  {
    name: 'jewelry_shipments',
    ruleKey: 'vertical_jewelry',
    category: 'EXCLUDED_COMMODITY',
    regex: /\b(jewelry|jewellery|fine\s+jewelry)\s+shipments?\b/i,
    extract: () => ({ shipperVertical: 'jewelry' }),
    action: { decision: 'WARN', message: 'Jewelry shipment — special handling required.' },
    confidence: 0.90,
  },
  {
    name: 'pharma_shipments',
    ruleKey: 'vertical_pharma',
    category: 'TEMPERATURE_CONTROL_MISSING',
    regex: /\b(pharmaceutical|pharma|prescription\s+drug)\s+shipments?\b/i,
    extract: () => ({ shipperVertical: 'pharma' }),
    action: { decision: 'WARN', message: 'Pharmaceutical shipment — temperature control may be required.' },
    confidence: 0.85,
  },
  {
    name: 'fine_art_shipments',
    ruleKey: 'vertical_fine_art',
    category: 'EXCLUDED_COMMODITY',
    regex: /\b(fine\s+art|artwork|sculpture|painting)\s+shipments?\b/i,
    extract: () => ({ shipperVertical: 'fine_art' }),
    action: { decision: 'WARN', message: 'Fine art shipment — special handling and appraisal may be required.' },
    confidence: 0.85,
  },

  // ═══ COMMODITY RESTRICTIONS ═══

  {
    name: 'excluded_commodity_list',
    ruleKey: 'commodity_excluded',
    category: 'EXCLUDED_COMMODITY',
    regex: /(?:the\s+)?following\s+(?:commodities|items|goods)\s+are\s+excluded\s*:\s*([^.!?\n]+)/i,
    extract: (m) => ({ commodityIn: one(m[1].trim()) }),
    action: { decision: 'BLOCK', message: 'Commodity is excluded from coverage.' },
    confidence: 0.65,
  },
];

// ── Public API ────────────────────────────────────────────────────────

/**
 * Run the T1 tokenizer against a single clause.
 *
 * Returns the best match (longest pattern) or null if no pattern fires.
 * This is a pure function — no I/O, no side effects, <5ms.
 */
export function tokenize(clauseText: string): TokenizerHit | null {
  let best: { pattern: TokenizerPattern; match: RegExpMatchArray } | null = null;
  let bestLen = 0;

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(clauseText);
    if (match) {
      const matchLen = match[0].length;
      if (matchLen > bestLen) {
        best = { pattern, match };
        bestLen = matchLen;
      }
    }
  }

  if (!best) return null;

  let conditionFragment: Partial<PolicyCondition>;
  try {
    conditionFragment = best.pattern.extract(best.match);
  } catch {
    return null;
  }

  return {
    ruleKey: best.pattern.ruleKey,
    category: best.pattern.category,
    conditionFragment,
    actionFragment: { ...best.pattern.action },
    confidence: best.pattern.confidence,
    patternName: best.pattern.name,
    matchedText: best.match[0],
  };
}

/**
 * Run the tokenizer against multiple clauses. Returns matches only (no nulls),
 * sorted by confidence descending.
 */
export function tokenizeAll(clauses: string[]): TokenizerHit[] {
  const hits: TokenizerHit[] = [];
  for (const clause of clauses) {
    const hit = tokenize(clause);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Return summary stats for a batch tokenization.
 */
export function tokenizeStats(clauses: string[]): {
  total: number;
  matched: number;
  unmatched: number;
  coverage: number;
  hits: TokenizerHit[];
} {
  const hits = tokenizeAll(clauses);
  return {
    total: clauses.length,
    matched: hits.length,
    unmatched: clauses.length - hits.length,
    coverage: clauses.length > 0 ? hits.length / clauses.length : 0,
    hits,
  };
}
