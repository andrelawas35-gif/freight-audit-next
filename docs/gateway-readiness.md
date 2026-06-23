# Gateway Readiness

## Strategy

The company is building a pre-shipment compliance gateway, but starts with post-shipment audit to gather evidence. Every audit result should become either a recovery workflow, a product signal, or both.

The goal after onboarding 3-5 clients is to answer:

- Which pre-shipment mistakes repeat?
- Which mistakes cost the most margin?
- Which client/carrier/service combinations create avoidable loss?
- Which rules should the gateway warn, require, or block?
- For jewelry shippers, which shipments create uninsured or underinsured exposure?

## Policy Intelligence MVP

Policy Intelligence converts unstructured client constraints into machine-readable operational rules. Inputs include carrier contracts, tariff guides, 3PL SLAs, insurance declarations, riders, claim instructions, shipment SOPs, email approvals, and tribal knowledge. The output is a client-specific compliance schema that can be audited post-shipment now and enforced pre-shipment later.

MVP objective:

```text
Policy documents + historical shipments + audit findings
-> structured policy rules
-> historical backtest
-> Gateway Readiness Assessment
-> future gateway ruleset
```

### MVP Workflow

1. **Policy intake**
   - Staff creates a client policy record.
   - Staff records source documents and effective dates.
   - Documents are classified as `carrier_contract`, `3pl_sla`, `insurance_policy`, `claims_policy`, `shipping_sop`, `packaging_standard`, or `email_exception`.

2. **Rule extraction and normalization**
   - Staff converts clauses into structured rules.
   - Each rule has a condition, action, severity, clause reference, and effective window.
   - AI may assist extraction later, but human review is required before activation.

3. **Ruleset versioning**
   - Draft rules are grouped into a versioned ruleset.
   - Only active rulesets are used for reporting or future gateway decisions.
   - Archived rules remain available for historical explainability.

4. **Historical backtest**
   - The evaluator runs active/draft rules against 12-24 months of shipment, invoice, claim, and audit data.
   - Results classify policy violations, preventable margin loss, uninsured exposure, and required gateway controls.

5. **Gateway Readiness Assessment**
   - Staff reviews backtest results.
   - Assessment summarizes preventable loss, non-preventable recovery, uninsured exposure, top broken rules, and recommended phase-one gateway controls.

6. **Operationalization**
   - Confirmed rules become the configuration set for future middleware.
   - The same evaluator should eventually serve `POST /api/gateway/validate-shipment`.

### MVP Console Routes

Recommended staff-only routes:

| Route | Purpose |
|-------|---------|
| `/policies` | List client policies and rulesets |
| `/policies/new` | Create policy record |
| `/policies/[policyId]` | Policy detail, documents, metadata |
| `/policies/[policyId]/rules` | Structured rule editor |
| `/policies/[policyId]/backtests` | Historical backtest runs |
| `/gateway-readiness/[clientId]` | Client readiness assessment |

### Policy Rule Shape

Rules should be stored as structured condition/action JSON, not prose-only notes.

```json
{
  "rule_key": "third_party_insurance_required",
  "condition_json": {
    "shipperVertical": "jewelry",
    "declaredValueGte": 5000,
    "carrierIn": ["FedEx", "UPS"]
  },
  "action_json": {
    "decision": "BLOCK",
    "message": "Use third-party insurance for jewelry shipments over $5,000.",
    "suggestedFix": "Select approved third-party insurance before label purchase."
  },
  "severity": "block",
  "clause_ref": "Policy Section 4.2"
}
```

### Policy Evaluator Contract

Add an evaluator that accepts a shipment-like context and active rules:

```ts
type ShipmentPolicyContext = {
  clientId: string;
  carrier?: string;
  serviceLevel?: string;
  destinationZip?: string;
  destinationCountry?: string;
  shipperVertical?: string;
  commodityType?: string;
  declaredValue?: number;
  insuredValue?: number;
  insuranceProvider?: string;
  signatureType?: string;
  packageType?: string;
  documentationReceived?: string[];
};

type PolicyDecision = {
  decision: 'ALLOW' | 'WARN' | 'BLOCK' | 'REQUIRE_APPROVAL' | 'REQUIRE_DOCUMENTATION';
  ruleKey: string;
  category: string;
  message: string;
  clauseRef?: string;
  suggestedFix?: string;
  confidence: number;
};
```

The evaluator must run in two modes:

- **post-shipment backtest mode** for consulting and readiness assessment;
- **pre-shipment validation mode** for the future gateway.

### Gateway Readiness Assessment Output

Each assessment should include:

- client and period;
- ruleset version used;
- total preventable margin loss;
- non-preventable recovery opportunity;
- uninsured or underinsured exposure;
- top violated policy rules;
- top preventable categories;
- recommended gateway controls;
- suggested rollout mode: advisory, require approval, or block.

### Human Review

Policy rules are compliance-sensitive. Early workflow must remain human-in-the-loop:

- AI/extraction can suggest clauses.
- Staff confirms rules before activation.
- Staff reviews backtest results before delivery.
- Client-facing readiness summaries should avoid exposing internal taxonomy labels without explanation.

## Behavioral Tag Requirement

Every flagged audit result must be tagged:

```ts
gatewayPreventability:
  | 'PREVENTABLE_BY_GATEWAY'
  | 'NON_PREVENTABLE_BY_GATEWAY'
  | 'UNKNOWN';
```

If `gatewayPreventability` is `PREVENTABLE_BY_GATEWAY`, the system must store a `gatewayRuleSuggestion`.

Implemented foundation:

- Schema/migration: `db/schema.ts`, `db/migrations/0004_gateway_insurance_intelligence.sql`.
- Typed taxonomy: `lib/intelligence/taxonomy.ts`.
- Report helpers: `lib/intelligence/reports.ts`.
- Tests: `lib/intelligence/taxonomy.test.ts`.
- Parcel/LTL and 3PL engines write default gateway metadata on new findings.

Examples:

| Finding | Preventability | Category | Rule Suggestion |
|---------|----------------|----------|-----------------|
| Dim weight trap caused by oversized packaging | `PREVENTABLE_BY_GATEWAY` | `DIM_WEIGHT_PADDING` | Warn when box exceeds allowed cube for item weight/profile |
| Residential surcharge because address was misclassified | `PREVENTABLE_BY_GATEWAY` | `ADDRESS_VALIDATION` | Validate address type before label purchase |
| Fuel surcharge billed incorrectly | `NON_PREVENTABLE_BY_GATEWAY` | `FUEL_SURCHARGE_ERROR` | No pre-shipment rule; dispute carrier billing |
| Carrier duplicate invoice | `NON_PREVENTABLE_BY_GATEWAY` or `PREVENTABLE_BY_GATEWAY` | `CARRIER_BILLING_GLITCH` or `DUPLICATE_ORDER_FLOW` | Depends on whether duplicate originated in client/3PL flow |

## Core Gateway Categories

- `DIM_WEIGHT_PADDING`
- `BOX_SIZE_MISMATCH`
- `WRONG_SERVICE_LEVEL`
- `ADDRESS_VALIDATION`
- `RESIDENTIAL_FLAG`
- `CARRIER_SELECTION`
- `ACCESSORIAL_AVOIDABLE`
- `LATE_SHIPMENT_RISK`
- `DUPLICATE_ORDER_FLOW`
- `THREE_PL_PICK_PACK_ERROR`
- `STORAGE_PROCESS_ERROR`
- `CARRIER_BILLING_GLITCH`
- `FUEL_SURCHARGE_ERROR`
- `CONTRACT_RATE_ERROR`
- `DATA_REQUIRED`

## High-Value Shipper Verticals

Jewelry is the first target vertical, but the insurance intelligence layer should be built for high-value shippers generally. Use `shipper_vertical` and `commodity_type` fields instead of hardcoding jewelry-only rules.

Priority verticals to gather data for:

| Vertical | Common Risk | Gateway Opportunity |
|----------|-------------|---------------------|
| Jewelry and watches | Theft, declared value limits, carrier/service exclusions, signature failures | Block uninsured labels, enforce adult signature, require third-party insurance |
| Fine art and collectibles | Fragility, appraisal requirements, excluded carriers, special handling | Require appraisal docs, approved carrier/service, packaging certification |
| Luxury fashion and handbags | Theft, counterfeit/return fraud, residential delivery risk | Require signature, address validation, insured return controls |
| Electronics and devices | Theft, lithium battery rules, serial number evidence | Require serial capture, battery compliance, signature thresholds |
| Pharmaceuticals and medical devices | Temperature excursion, chain-of-custody, regulatory handling | Require temperature service, documented custody, approved carrier lanes |
| Lab samples and biotech | Time/temperature sensitivity, regulatory classification | Require service level, packaging class, deadline controls |
| Precious metals and coins | High theft risk, carrier exclusions, declared value restrictions | Block disallowed services, require armored/approved carrier where needed |
| Firearms and regulated sporting goods | Regulatory restrictions, adult signature, carrier prohibitions | Block prohibited lanes/services, require compliance documentation |
| Wine and spirits | Adult signature, temperature, state restrictions | Require adult signature, destination legality, temperature protection |
| High-value auto/aerospace parts | Expensive exceptions, dimensional/freight class errors, critical delivery | Enforce packaging, freight class, SLA/routing approval |
| Trade show/event equipment | Time-critical delivery, high accessorial exposure, venue delivery complexity | Warn on service risk, venue accessorials, delivery appointment requirements |
| Documents and financial instruments | Chain-of-custody, delivery proof, limited replaceability | Require signature, custody scan, approved express service |

Common fields across these verticals:

- `shipper_vertical`
- `commodity_type`
- `declared_value`
- `replacement_value`
- `insured_value`
- `insurance_provider`
- `policy_id`
- `carrier_declared_value_used`
- `signature_type`
- `adult_signature_required`
- `chain_of_custody_required`
- `temperature_control_required`
- `special_handling_required`
- `regulated_item_flag`
- `documentation_required`
- `documentation_received`
- `destination_risk_tier`
- `approved_carrier_required`
- `approved_service_required`

## Insurance Risk Categories

- `DECLARED_VALUE_MISMATCH`
- `UNDER_INSURED_SHIPMENT`
- `OVER_INSURED_SHIPMENT`
- `EXCLUDED_COMMODITY`
- `INVALID_CARRIER_SERVICE`
- `MISSING_SIGNATURE_REQUIRED`
- `HIGH_RISK_DESTINATION`
- `PACKAGING_NON_COMPLIANT`
- `CHAIN_OF_CUSTODY_GAP`
- `POLICY_LIMIT_EXCEEDED`
- `CLAIM_WINDOW_RISK`
- `THIRD_PARTY_INSURANCE_REQUIRED`
- `CARRIER_DECLARED_VALUE_NOT_ALLOWED`
- `DOCUMENTATION_MISSING`
- `APPRAISAL_REQUIRED`
- `SERIAL_NUMBER_REQUIRED`
- `TEMPERATURE_CONTROL_MISSING`
- `REGULATED_ITEM_NON_COMPLIANT`
- `DESTINATION_RESTRICTED`
- `APPROVED_CARRIER_REQUIRED`
- `APPROVED_SERVICE_REQUIRED`

## Gateway Action Model

Future pre-shipment gateway decisions should use:

```ts
gatewayAction:
  | 'ALLOW'
  | 'WARN'
  | 'BLOCK'
  | 'REQUIRE_APPROVAL'
  | 'REQUIRE_DOCUMENTATION';
```

Examples:

- `WARN`: selected box size is likely to trigger dimensional billing.
- `BLOCK`: jewelry declared value exceeds policy limit for selected carrier/service.
- `REQUIRE_APPROVAL`: high-risk destination requires manager approval.
- `REQUIRE_DOCUMENTATION`: invoice/photo/chain-of-custody documents missing.

## Insurance Policy Data to Capture

During onboarding for the first 3-5 clients in any high-value vertical, collect:

- policy document;
- insurer and broker;
- effective dates;
- max coverage per shipment and per day;
- deductible;
- commodity coverage and exclusions;
- allowed/excluded carriers;
- allowed/excluded service levels;
- declared value limits;
- whether carrier declared value is allowed;
- third-party insurance thresholds;
- required signature/adult signature thresholds;
- destination exclusions and high-risk ZIP/country rules;
- packaging requirements;
- external label/description restrictions;
- claim window days;
- required claim documents;
- chain-of-custody requirements.
- vertical-specific requirements such as temperature controls, appraisals, serial numbers, adult signature, regulatory restrictions, or approved carrier lanes.

Convert these into structured policy rules. Notes are useful as backup, not as the primary data model.

Implemented storage foundation:

- `client_insurance_policies`
- `insurance_policy_rules`
- `shipment_insurance_audit_results`

Policy onboarding UI and extraction workflow are still backlog items.

## Readiness Report Outputs

For sales and product roadmap:

1. Total margin lost per month to preventable errors.
2. Gateway ROI: estimated savings if gateway had been active.
3. Top preventable categories by dollars and count.
4. Top suggested pre-shipment rules.
5. For jewelry: total declared value shipped, non-compliant value, uninsured exposure, and rules needed.

Implemented helpers:

- `getGatewayReadinessReport()`
- `getTopGatewayRuleSuggestions()`
- `getInsuranceExposureReport()`

These live in `lib/intelligence/reports.ts`.

## Human Review

Gateway tags may be rule-defaulted but must remain reviewable. For early clients, analyst confirmation matters more than automation volume. The first 3-5 clients are the training dataset for the SaaS product.

## Implementation Status

Done:

1. Added gateway columns to `"Audit Results"` in Drizzle schema and migration.
2. Updated audit result types.
3. Added taxonomy helpers that enforce preventable findings require suggestions.
4. Updated parcel/LTL and 3PL audit writes with default gateway metadata.
5. Added high-value insurance policy and audit result tables.
6. Added readiness report query helpers.

Remaining:

1. Run migration in each target database.
2. Add policy onboarding workflow or admin table editor.
3. Add queue/report UI filters and review controls.
4. Add analyst review workflow for gateway tags.
5. Add shipment-level ingestion of declared value, commodity, documentation, and policy fields.
