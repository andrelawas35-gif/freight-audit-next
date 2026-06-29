# Policy Intelligence — Gap Analysis & Backtest

> **STATUS: IMPLEMENTED (2026-06-26).** All 8 correctness items from ADR 0001 are
> implemented in `lib/intelligence/policy-service.ts`: shipment spine, keyset pagination,
> dedup, multi-shipment handling, tri-valued evaluation, effective-dating, condition key
> validation, preview/official modes. 19 backtest correctness tests pass. Migration 0007
> adds `mode`, `input_snapshot`, `data_required_count` columns. See `../../CHANGELOG.md`
> for full details.

## Policy evaluator contract

The evaluator accepts a shipment-like context plus active rules and returns decisions.
It must run in **two modes** from the same code: `backtest` (consulting/readiness) and
`pre-shipment validation` (the future gateway, eventually `POST /api/gateway/validate-shipment`).

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
  // backtest linkage:
  shipmentId?: string;
  invoiceId?: string;
  auditResultId?: string;
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

Decision/category enums are canonical in [`03-taxonomy.md`](03-taxonomy.md).

## Shipment context model

The backtest builds **one `ShipmentPolicyContext` per shipment**, with `"Shipments"` as
the spine. This is the foundation that lets an axis-crossing ("Linked Audit") rule —
e.g. `{ shipperVertical, declaredValueGte, carrierIn }` — actually match. See
[ADR 0001](../adr/0001-backtest-shipment-context-model.md) for why; the rejected
alternative (per-data-source contexts) made such rules structurally unmatchable.

The spine is a multi-hop array join (GIN-indexed):

```text
"Shipments".id
   ← "Invoices"."Shipment"  (text[], @>)
   ← "Audit Results"."Invoice"  (text[], @>)        -- preventable financial loss
"Shipments".id
   ← shipment_insurance_audit_results.shipment_id    -- coverage / uninsured exposure
   ← (planned) insurance_claims                       -- denied-claim ground truth
```

Resolved rules:

- **Grain.** One context per shipment. Audit findings are aggregated onto the shipment,
  **deduped by `audit_result_id`**, so `preventableLoss` is a property of the shipment,
  not re-counted per matching rule.
- **Scope.** Evaluate **every** shipment in the period, not only flagged ones. Coverage
  violations (missing signature on a high-value item) have zero billing variance and no
  `"Audit Results"` row, yet are exactly the moat finding. Requires keyset pagination over
  `"Shipments"` — no `LIMIT` truncation.
- **Multi-shipment invoices.** When an invoice's `"Shipment"` array has >1 entry, audit
  loss is **not** split or duplicated across shipments; it stays at invoice grain and the
  shipment is tagged `DATA_REQUIRED`. (The legacy engine's `invoice['Shipment'][0]`
  shortcut is a known mis-attribution — do not copy it.)
- **Unknown ≠ compliant.** A condition whose input field is null evaluates to `unknown`,
  not pass/fail, and emits `REQUIRE_DOCUMENTATION` / `DATA_REQUIRED` rather than a silent
  ALLOW or a false violation. The readiness report then has three buckets: preventable,
  non-preventable, and uncertain-pending-data.

It writes `policy_backtest_runs` (one per run) and `policy_backtest_results` (one row per
violated rule). It **must not mutate** source shipments, invoices, or audit results.

## Reproducibility

A backtest is a consulting deliverable, so it must be **reproducible**: the run
**snapshots its resolved input contexts** rather than re-reading live `"Audit Results"` /
`shipment_insurance_audit_results` (which mutate under analyst review and re-audits). Store
the ruleset id/version, the historical period, the input snapshot, aggregate counts and
dollars, one result row per violation, and clause references.

## Backtest modes

Two modes, stamped on `policy_backtest_runs`:

- **`preview`** — `includeDraft: true`, staff-only what-if. **Never** feeds a Gateway
  Readiness Assessment.
- **`official`** — **active rules only.** The only mode a client-facing assessment may
  cite (human-review invariant 10).

## Effective-dated ruleset selection

Each shipment is evaluated against the ruleset **in force on its `"Ship date"`**, not the
latest one (see [`00-glossary.md`](00-glossary.md) and
[`01-ingestion.md`](01-ingestion.md#effective-dating-and-renewals)). Active rulesets for a
client must not overlap. This is only implementable because the shipment-spine context
carries a ship date; the old per-source contexts carried only `created_at`.

> Current code gap: `runPolicyBacktest` still loads one ruleset by id and ignores ship
> date. Tracked in [`../BACKLOG.md`](../BACKLOG.md).

## A shipment's possible states

The two evaluators are independent, so a shipment can be:

- financially correct but policy non-compliant;
- financially incorrect but not preventable by the gateway;
- both financially incorrect and preventable;
- blockable/warnable pre-shipment even with no carrier invoice discrepancy at all.

## Job model

Backtests fit the existing Postgres job queue (`audit_jobs`, `FOR UPDATE SKIP LOCKED`).
See the queue section in [`../audit-engine.md`](../audit-engine.md). They are read-heavy
and reproducible, so re-running a period with the same ruleset must yield the same rows.
