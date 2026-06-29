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

## The 4-tier extraction pipeline (ADR 0012)

```text
TIER 1 — Deterministic Tokenizer     phrase/pattern matching, zero-cost, zero-latency, ~40-60% coverage
TIER 2 — LLM Data Mapper            GPT-4o-mini → DeepSeek-V3 → Claude Haiku escalation, Zod-gated
TIER 3 — Vector Memory Bank          pgvector semantic caching, cross-client dedup, T3→T1 feedback loop
TIER 4 — Client Ambiguity Dashboard  Define/Exclude/Flag — shifts unmappable clauses from staff cost
                                     center to premium client compliance workflow
        |
        v
   Structured policy_rules → Backtest → Gateway Readiness Assessment
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
| [`07-schema-evolution.md`](07-schema-evolution.md) | **Taxonomy Discovery / Cross-Tenant Learning** (planning): how novel (L3) policy variables are captured suggest-only and promoted; capture-vs-enforce; no runtime DDL. | Designing the "learn a new variable" / network-effect feature |
| [`08-gateway.md`](08-gateway.md) | **The Aurelian Gateway** (planning): the operationalize/runtime service that wraps the evaluator — precheck contract, shadow-first rollout, topology, risk-tiered fail-closed, forensic decision log. | Building the pre-shipment gateway middleware |
| [`09-analyst-decision-support.md`](09-analyst-decision-support.md) | **Analyst decision support** (planning): operating model for a domain-novice founder-analyst — transcription vs judgment, three-lane confidence×grounding routing, borrowed/encoded authority, backtest-as-evidence, clients-1–5 playbook, viability verdict. | Founder/analyst decisions; go-to-market for the first clients |

## Console routes (staff-only)

| Route | Purpose |
|-------|---------|
| `/policies` | List client policies and rulesets |
| `/policies/new` | Create policy record |
| `/policies/[policyId]` | Policy detail, documents, metadata |
| `/policies/[policyId]/rules` | Structured rule editor |
| `/policies/[policyId]/backtests` | Historical backtest runs |
| `/gateway-readiness/[clientId]` | Client readiness assessment |

## Portal routes (client-facing)

| Route | Purpose |
|-------|---------|
| `/portal/policy-review` | T4 Client Ambiguity Dashboard — Define/Exclude/Flag unmapped clauses |

All staff routes are `requireStaff()`. The `/portal/policy-review` route is client-scoped via `session.user.clientId`.

**Trust boundary**: T4 marks a shift — clients now Define (author their own rules with `CLIENT_DEFINED` signal), Exclude (binding governance record), or Flag (route to staff). This is a premium compliance workflow, not self-service rule authoring. See ADR 0012 D5.

## Invariants (from CLAUDE.md)

7. Every flagged audit result carries gateway preventability metadata
   (`PREVENTABLE_BY_GATEWAY`, `NON_PREVENTABLE_BY_GATEWAY`, `UNKNOWN`).
8. A `PREVENTABLE_BY_GATEWAY` finding must store a concrete `gateway_rule_suggestion`.
9. Policy intelligence is **structured data**, not notes-only text.
10. Policy activation is **human-reviewed**: extraction suggests; staff confirm before
    a rule is active for backtests, readiness, or future enforcement.

## Architecture decisions

- [ADR 0001](../adr/0001-backtest-shipment-context-model.md) — shipment-spine backtest context.
- [ADR 0002](../adr/0002-extraction-service-language-boundary.md) — extraction stays TS until volume justifies Python.
- [ADR 0003](../adr/0003-retrieval-and-llm-boundary.md) — **RAG/LLM boundary**: deterministic detection only; no flat-file rule store; retrieval is document-scoped/tenant-isolated/suggest-only; LLM narrates findings, never detects.

## Implementation status

Stable contracts live in this module. **Open work lives in
[`../BACKLOG.md`](../BACKLOG.md)** (Policy Intelligence MVP section) and historical
changes in [`../CHANGELOG.md`](../CHANGELOG.md). Do not duplicate status checklists here.

Code today: `lib/intelligence/{taxonomy,policy-evaluator,policy-service,reports,classifier,tokenizer,pipeline}.ts`,
schema in `db/schema.ts`, migrations `0004_gateway_insurance_intelligence.sql`,
`0005_policy_intelligence_mvp.sql`, `0013_policy_scope_exclusions.sql`,
UI under `app/(console)/policies/`, `app/(console)/gateway-readiness/`,
`app/(portal)/portal/policy-review/`.
