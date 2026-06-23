# Policy Intelligence

> Single source of truth for the Policy Intelligence concern. If you are touching
> anything in this module, load this folder — not the layer docs. The layer docs
> (`data-layer.md`, `audit-engine.md`, `ingestion.md`) now point here.

## What this is

Policy Intelligence converts **unstructured client constraints** (carrier contracts,
tariff guides, 3PL SLAs, insurance declarations, riders, claim instructions, shipment
SOPs, packaging standards, email approvals, tribal knowledge) into **structured,
machine-readable rules**.

It is the bridge between two products:

```text
The Audit  (the past)        Policy Intelligence (the diagnosis)     The Gateway (the future)
post-shipment overcharges -> why the loss was preventable        -> pre-shipment enforcement
"the bill was wrong"          "the shipment should not have shipped"   "block it before the label"
```

The audit asks *"was the bill wrong?"* The policy evaluator asks *"should this shipment
have been allowed under the client's contract, insurance, SLA, SOP, and exception
rules?"* Keep these concerns separate; let their outputs join only in the Gateway
Readiness Assessment.

## The 4-step pipeline

```text
1. Ingestion       policy documents + historical shipments/invoices/claims/audit findings
2. Extraction      clauses -> structured policy_rules (condition/action JSON), human-confirmed
3. Gap analysis    active/draft ruleset backtested against 12-24 months of history
4. Operationalize  confirmed ruleset becomes the future gateway config + monitoring hooks
        |
        v
   Gateway Readiness Assessment -> pre-shipment product roadmap
```

## Files in this module

| File | Contents | Load when |
|------|----------|-----------|
| [`00-glossary.md`](00-glossary.md) | Canonical vocabulary: Policy vs Ruleset vs Rule vs Document vs Backtest vs Assessment; "preventable"; "Linked Audit". | Any term feels ambiguous |
| [`01-ingestion.md`](01-ingestion.md) | Policy **document** intake (distinct from shipment ingestion): source types, `policy_documents` lifecycle, blob storage, effective-dating, claims data. | Building intake/upload |
| [`02-extraction.md`](02-extraction.md) | Clause -> `policy_rules`; `rule_key` namespace; condition/action JSON shape; AI **suggest-only** trust boundary. | Building the rule editor or AI extractor |
| [`03-taxonomy.md`](03-taxonomy.md) | **Single source** for every enum (gateway categories, insurance risk categories, decisions, preventability, signal source, verticals). Mirrors `lib/intelligence/taxonomy.ts`. | Adding/changing any category or enum |
| [`04-backtest.md`](04-backtest.md) | Evaluator contract, gap analysis, `policy_backtest_runs/results`, effective-dated ruleset selection. | Building/changing the backtest |
| [`05-readiness.md`](05-readiness.md) | Gateway Readiness Assessment output + the client-facing Compliance Intelligence Package. | Building reports/deliverables |
| [`06-schema.md`](06-schema.md) | All 11 policy/insurance/gateway tables. Moved here from `data-layer.md`. | Touching policy schema/migrations |

## Console routes (staff-only)

| Route | Purpose |
|-------|---------|
| `/policies` | List client policies and rulesets |
| `/policies/new` | Create policy record |
| `/policies/[policyId]` | Policy detail, documents, metadata |
| `/policies/[policyId]/rules` | Structured rule editor |
| `/policies/[policyId]/backtests` | Historical backtest runs |
| `/gateway-readiness/[clientId]` | Client readiness assessment |

All routes are `requireStaff()`. Policy Intelligence **is the consulting handover** —
clients never author their own rules. See [`01-ingestion.md`](01-ingestion.md#trust-and-scope).

## Invariants (from CLAUDE.md)

7. Every flagged audit result carries gateway preventability metadata
   (`PREVENTABLE_BY_GATEWAY`, `NON_PREVENTABLE_BY_GATEWAY`, `UNKNOWN`).
8. A `PREVENTABLE_BY_GATEWAY` finding must store a concrete `gateway_rule_suggestion`.
9. Policy intelligence is **structured data**, not notes-only text.
10. Policy activation is **human-reviewed**: extraction suggests; staff confirm before
    a rule is active for backtests, readiness, or future enforcement.

## Implementation status

Stable contracts live in this module. **Open work lives in
[`../BACKLOG.md`](../BACKLOG.md)** (Policy Intelligence MVP section) and historical
changes in [`../CHANGELOG.md`](../CHANGELOG.md). Do not duplicate status checklists here.

Code today: `lib/intelligence/{taxonomy,policy-evaluator,policy-service,reports}.ts`,
schema in `db/schema.ts`, migrations `0004_gateway_insurance_intelligence.sql` and
`0005_policy_intelligence_mvp.sql`, UI under `app/(console)/policies/` and
`app/(console)/gateway-readiness/`.
