# Policy Intelligence Taxonomy

> **Single source of truth for every Policy Intelligence enum.** Other docs must link
> here instead of re-listing these values. The executable authority is
> [`lib/intelligence/taxonomy.ts`](../../lib/intelligence/taxonomy.ts) — if this file and
> the code disagree, the code wins and this file is the bug. Do not paste these lists
> into `audit-engine.md`, `gateway-readiness.md`, or anywhere else.

## Gateway preventability

```ts
gatewayPreventability:
  | 'PREVENTABLE_BY_GATEWAY'
  | 'NON_PREVENTABLE_BY_GATEWAY'
  | 'UNKNOWN';
```

If `PREVENTABLE_BY_GATEWAY`, a `gatewayRuleSuggestion` is **required**
(`validateGatewayTag()` throws; a DB check constraint enforces the same).

## Gateway decision / action

```ts
gatewayAction:
  | 'ALLOW'
  | 'WARN'
  | 'BLOCK'
  | 'REQUIRE_APPROVAL'
  | 'REQUIRE_DOCUMENTATION';
```

Exported as `GATEWAY_ACTIONS`. Every rule's `action_json.decision` is validated against
this list before write.

- `WARN` — selected box size is likely to trigger dimensional billing.
- `BLOCK` — jewelry declared value exceeds policy limit for selected carrier/service.
- `REQUIRE_APPROVAL` — high-risk destination requires manager approval.
- `REQUIRE_DOCUMENTATION` — invoice/photo/chain-of-custody documents missing.

## Gateway signal source

```ts
gatewaySignalSource:
  | 'RULE_DEFAULT'      // engine default at finding time
  | 'ANALYST_REVIEW'    // human confirmed/edited
  | 'AI_SUGGESTED';     // proposed by extraction, not yet confirmed
```

## Severity

```ts
severity: 'info' | 'warn' | 'block';
```

## Core gateway categories

Behavioral categories for preventable-loss mapping:

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

## Insurance risk categories

For high-value shippers (the Linked Audit / coverage layer):

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

Every insurance finding should answer: was this preventable pre-shipment? which policy
clause was violated? which gateway action would have prevented it? what value was
exposed?

## High-value shipper verticals

Jewelry is the first target vertical, but the insurance layer is built vertical-agnostic.
Use the `shipper_vertical` / `commodity_type` fields rather than hardcoding jewelry rules.

```text
shipper_vertical =
    jewelry | fine_art | luxury_goods | electronics | pharma | medical_device
  | precious_metals | regulated_goods | wine_spirits | aerospace_parts
  | event_equipment | sensitive_documents | other
```

| Vertical | Common risk | Gateway opportunity |
|----------|-------------|---------------------|
| Jewelry & watches | Theft, declared-value limits, carrier/service exclusions, signature failures | Block uninsured labels, enforce adult signature, require third-party insurance |
| Fine art & collectibles | Fragility, appraisal requirements, excluded carriers | Require appraisal docs, approved carrier/service, packaging certification |
| Luxury fashion & handbags | Theft, return fraud, residential delivery risk | Require signature, address validation, insured return controls |
| Electronics & devices | Theft, lithium-battery rules, serial evidence | Require serial capture, battery compliance, signature thresholds |
| Pharma & medical devices | Temperature excursion, chain-of-custody, regulatory handling | Require temperature service, documented custody, approved lanes |
| Lab samples & biotech | Time/temperature sensitivity, regulatory classification | Require service level, packaging class, deadline controls |
| Precious metals & coins | High theft risk, carrier exclusions, declared-value restrictions | Block disallowed services, require armored/approved carrier |
| Firearms & regulated sporting goods | Regulatory restrictions, adult signature, carrier prohibitions | Block prohibited lanes/services, require compliance docs |
| Wine & spirits | Adult signature, temperature, state restrictions | Require adult signature, destination legality, temperature protection |
| High-value auto/aerospace parts | Dimensional/freight-class errors, critical delivery | Enforce packaging, freight class, SLA/routing approval |
| Trade show / event equipment | Time-critical delivery, accessorial exposure, venue complexity | Warn on service risk, venue accessorials, appointment requirements |
| Documents & financial instruments | Chain-of-custody, delivery proof, limited replaceability | Require signature, custody scan, approved express service |

## Shipment fields the taxonomy consumes

Common fields across verticals (captured at ingestion when available; see
[`01-ingestion.md`](01-ingestion.md)):

`shipper_vertical`, `commodity_type`, `declared_value`, `replacement_value`,
`insured_value`, `insurance_provider`, `policy_id`, `carrier_declared_value_used`,
`signature_type`, `adult_signature_required`, `chain_of_custody_required`,
`temperature_control_required`, `special_handling_required`, `regulated_item_flag`,
`documentation_required`, `documentation_received`, `destination_risk_tier`,
`approved_carrier_required`, `approved_service_required`.
