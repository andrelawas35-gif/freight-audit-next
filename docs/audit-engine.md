# Audit Engine

## Purpose

The audit engine detects post-shipment billing discrepancies and writes findings to `"Audit Results"`. Going forward, every flagged finding must also become a gateway-readiness behavioral signal.

Implemented: new parcel/LTL and 3PL findings now receive default gateway metadata from `lib/intelligence/taxonomy.ts` when written to `"Audit Results"`.

## Parcel/LTL Engine (`lib/audit/engine.ts`)

1. Keyset-paginates all invoices, optionally by client, via `fetchAllRecords()`.
2. Applies `createdBefore` cutoff from the audit job start time.
3. Chunk-loads linked shipments and existing audit results.
4. Loads rulebook and builds resolver.
5. Runs rules per invoice/shipment pair.
6. Adds gateway taxonomy metadata for every flagged finding.
7. Batch-creates `"Audit Results"` transactionally.
8. Updates client's `"Last audit run"`.

Never use bounded `fetchRecords()` for financial completeness.

## 3PL Engine (`lib/audit/3pl-engine.ts`)

1. Keyset-paginates pending `tpl_fulfillment_lines` / `tpl_storage_lines`.
2. Applies `runStartedAt` cutoff directly in SQL.
3. Runs fulfillment, storage, duplicate, data-required, and ghost shipment rules.
4. Adds gateway taxonomy metadata for every flagged finding.
5. Writes findings to shared `"Audit Results"` transactionally.
6. Marks exactly the processed page as `audited`.

## Current Rules

### Parcel/LTL

| Rule | Code | Logic | Gateway Direction |
|------|------|-------|-------------------|
| Dim weight | `DIM_WEIGHT_TRAP` | Carrier used dim weight > actual; flags if overcharge > $1 | Usually `PREVENTABLE_BY_GATEWAY` / `DIM_WEIGHT_PADDING` |
| Phantom accessorial | `PHANTOM_ACCESSORIAL` | Residential surcharge on commercial address or contract-waived | Often `PREVENTABLE_BY_GATEWAY` / `ADDRESS_VALIDATION` or `ACCESSORIAL_AVOIDABLE` |
| Duplicate tracking | `DUPLICATE_TRACKING` | Same carrier + date + amount proxy | Depends on source; carrier glitch vs duplicate order flow |
| SLA failure | `SLA_FAILURE`, `LTL_SLA_FAILURE` | Delivery late vs guaranteed transit days | Usually `NON_PREVENTABLE_BY_GATEWAY`, unless gateway selected wrong service |

### 3PL

| Rule | Code | Logic | Gateway Direction |
|------|------|-------|-------------------|
| Pick fee | `TPL_PICK_FEE` | Billed pick fees exceed contract rates | Usually non-preventable billing/rate issue |
| Packaging | `TPL_PACKAGING` | Packaging fee exceeds contract | Can become packaging control signal |
| Freight markup | `TPL_FREIGHT_MARKUP` | Cost-plus markup exceeds agreed percent | Usually non-preventable billing issue |
| Ghost shipment | `TPL_GHOST_SHIPMENT` | Billed for order with no matching client shipment | `PREVENTABLE_BY_GATEWAY` when gateway could block invalid fulfillment |
| Duplicate | `TPL_DUPLICATE` | Same order billed in multiple cycles | Often `PREVENTABLE_BY_GATEWAY` / `DUPLICATE_ORDER_FLOW` |
| Storage | `TPL_STORAGE` | Storage rate exceeds contract | Usually non-preventable rate issue unless inventory flow caused avoidable storage |

## Gateway-Ready Taxonomy

Every flagged audit result should include:

```ts
gatewayPreventability:
  | 'PREVENTABLE_BY_GATEWAY'
  | 'NON_PREVENTABLE_BY_GATEWAY'
  | 'UNKNOWN';

gatewayCategory: string;
gatewayRuleSuggestion: string | null;
gatewayEstimatedSavings: number;
gatewayConfidence: number;
gatewaySignalSource:
  | 'RULE_DEFAULT'
  | 'ANALYST_REVIEW'
  | 'AI_SUGGESTED';
```

If `gatewayPreventability === 'PREVENTABLE_BY_GATEWAY'`, `gatewayRuleSuggestion` is required.

Enforcement:

- `validateGatewayTag()` throws if a preventable tag lacks a suggestion.
- Migration `0004_gateway_insurance_intelligence.sql` adds DB check constraints for the same rule.
- `gatewayTagToFields()` serializes typed tags to `"Audit Results"` column names.

The canonical category lists (gateway behavioral categories and high-value insurance risk
categories), the decision/signal-source enums, and the example rule suggestions are
single-sourced in
[`policy-intelligence/03-taxonomy.md`](policy-intelligence/03-taxonomy.md) — do not
re-list them here. The executable authority is `lib/intelligence/taxonomy.ts`.

Every insurance finding should answer: was this preventable pre-shipment? which policy
clause was violated? which gateway action (`ALLOW`/`WARN`/`BLOCK`/`REQUIRE_APPROVAL`/
`REQUIRE_DOCUMENTATION`) would have prevented it? what value was exposed?

## Rulebook (`lib/audit/rulebook.ts`)

- 3-tier resolution: contract (client+carrier) -> carrier -> global.
- Effective-dated with `effective_from` / `effective_to`.
- Service-level scoped when needed.
- Scoring: contract=30, carrier=20, global=10, service-specific +5.
- `clause_ref` cites contract/MSA/policy language.
- Admin UI at `/rulebook`.

Rule keys currently include:

- Carrier group: `dim_divisor`, `residential_surcharge`, `residential_waived`, `guarantee_enabled`, `sla_transit_days`.
- 3PL group: `pricing_model`, `pick_base_fee`, `pick_additional_fee`, `packaging_fee`, `freight_markup_pct`, `storage_rate`, `storage_billing_method`.

Future gateway/insurance keys should reuse rulebook structure where possible instead of hardcoding client-specific logic.

## Gateway Readiness Reports

The report layer should calculate:

- total margin lost per month to `PREVENTABLE_BY_GATEWAY` findings;
- preventable savings by category;
- preventable savings by client/carrier/service;
- top gateway rule suggestions;
- high-value shipper uninsured exposure by policy rule and category.

Implemented helpers in `lib/intelligence/reports.ts`:

- `getGatewayReadinessReport()`
- `getTopGatewayRuleSuggestions()`
- `getInsuranceExposureReport()`

## Policy Backtesting and Evaluation

Policy Intelligence adds a second evaluator beside the audit engine.

The audit engine asks:

```text
Was the bill wrong?
```

The policy evaluator asks:

```text
Should this shipment have been allowed under the client's contract, insurance, SLA, SOP, and exception rules?
```

Keep these concerns separate, but allow their outputs to join in Gateway Readiness reporting. A shipment can be financially correct but policy non-compliant, financially incorrect but not preventable, both, or blockable pre-shipment with no invoice discrepancy at all.

The evaluator contract (inputs/outputs), backtest reproducibility rules, effective-dated
ruleset selection, and how assessments combine backtest drift + audit gateway metadata +
insurance exposure are single-sourced in
[`policy-intelligence/04-backtest.md`](policy-intelligence/04-backtest.md) and
[`policy-intelligence/05-readiness.md`](policy-intelligence/05-readiness.md).

## Job Queue (`lib/audit/jobs.ts`)

Postgres-backed queue using `audit_jobs`:

- `enqueueAudit()` creates jobs and rejects overlapping queued/running jobs for the same scope.
- `claimNextJob()` uses `SELECT ... FOR UPDATE SKIP LOCKED`.
- `completeJob()` / `failJob()` write terminal status.
- `expireStaleJobs(15)` fails stale running jobs.

Job types: `parcel`, `3pl`, `data_clerk`, `sftp_fetch`.

## Testing

Existing tests cover rulebook, parcel rules, 3PL rules, engines, and formula translator.

When adding gateway/insurance taxonomy:

- test null/missing-data guards;
- test non-flag paths;
- test flagged path with gateway metadata;
- test that preventable findings without a rule suggestion fail;
- test client/policy/rulebook precedence;
- test report query helpers once implemented.

Current taxonomy tests live in `lib/intelligence/taxonomy.test.ts`.

Run: `npm test` or `npx vitest run`.

## Key Files

| File | Purpose |
|------|---------|
| `lib/audit/engine.ts` | Parcel/LTL engine |
| `lib/audit/3pl-engine.ts` | 3PL engine |
| `lib/audit/rulebook.ts` | Rulebook resolver |
| `lib/audit/rule-keys.ts` | Rule key metadata |
| `lib/audit/3pl-rules.ts` | 3PL rule functions |
| `lib/audit/rules/*.ts` | Parcel rule functions |
| `lib/audit/jobs.ts` | Job queue |
| `lib/audit/runs.ts` | Run history |
| `lib/audit/types.ts` | Audit result types |
| `lib/intelligence/taxonomy.ts` | Gateway/high-value taxonomy and default rule tags |
| `lib/intelligence/reports.ts` | Gateway ROI and insurance exposure report queries |
| `components/console/run-panel.tsx` | Engine UI |
| `app/(console)/engine/actions.ts` | Audit server action |
