# Policy Intelligence — Extraction & Normalization

Converting clauses from source documents into structured `policy_rules`. The output is
**structured rule data, not notes** (invariant 9). You are not summarizing a contract;
you are building a table of IF/THEN logic the evaluator can run.

## Rule shape

Each rule is a declarative condition + action, stored as JSON:

```json
{
  "rule_key": "third_party_insurance_required",
  "category": "THIRD_PARTY_INSURANCE_REQUIRED",
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

Required fields when normalizing: `rule_key`, `category`, `condition_json`,
`action_json`, `severity`, `clause_ref`, plus the ruleset's effective window. `category`
must come from [`03-taxonomy.md`](03-taxonomy.md); `action_json.decision` must be a valid
`GATEWAY_ACTIONS` value (validated before write).

## `rule_key` namespace

`rule_key` is the stable machine key — keep it human-readable and reusable across
clients where the constraint is the same (`adult_signature_required`, `carrier_excluded`,
`third_party_insurance_required`, `declared_value_limit`). Prefer reusing an existing key
and varying the `condition_json` over inventing client-specific keys, so the future
gateway can reason across clients. Where an audit rulebook key already covers the
constraint, reuse the rulebook structure rather than hardcoding client logic.

## Lineage

Every rule keeps `policy_id`, `document_id`, and `clause_ref` so any suggestion is
traceable back to the page it came from. The reviewer verifies the suggestion against the
**stored document blob** (see [`01-ingestion.md`](01-ingestion.md#document-storage--keep-the-bytes)).

## Trust boundary

AI extraction is a **suggest-only** helper (invariants 4 and 10). Make the boundary
structural, not just promptual — a malicious or garbage client PDF must be unable to
produce an enforced rule:

1. **Extraction output is always `status='draft'`.** The AI can never write
   `status='active'`. Activation is a separate, staff-only transition. By construction,
   the worst a poisoned document can do is propose a draft a human must approve.
2. **Structured candidates only.** The extractor returns `rule_key`, a `category` from
   the fixed taxonomy, and condition/action JSON. Any category or decision not in the
   canonical enums is rejected — there is no free-text field for instructions to land in.
3. **Document content is data, never instructions.** Text from a client PDF is quoted to
   staff for confirmation, never executed. Treat embedded "ignore previous instructions"
   style content as inert.
4. **Carry lineage** (`document_id` + `clause_ref`) on every suggestion so the reviewer
   checks it against the original.

This mirrors the platform-wide *AI-is-suggest-only* invariant used by the dispute parser
and the ingestion data clerk.

## Extraction architecture

The extractor is an **async, queued, human-reviewed** worker — never in a user request
path. It rides the existing Postgres job queue (`audit_jobs`, `FOR UPDATE SKIP LOCKED`)
with a new `policy_extract` job type. Do **not** introduce a second orchestrator/state
store (e.g. a graph checkpointer) as a parallel source of truth for "where is this
document in the pipeline" — one queue, one status model (`policy_documents.extraction_status`).

### Pipeline stages

```text
1. parse      stored blob -> structured text/tables        (LlamaParse)
2. classify   document_type + relevant clauses             (cheap model)
3. extract    clauses -> candidate policy_rules (JSON)      (cheap model)
4. validate   Zod gate: taxonomy category + PolicyCondition keys + grounded clause_ref
5. escalate   only candidates that trip a tripwire -> Claude/OpenAI
6. emit        draft rules: status='draft', signal_source='AI_SUGGESTED', lineage attached
```

Stage 4 is the same Zod schema used by `addRuleAction` (see the **B3** check in
[`04-backtest.md`](04-backtest.md) / `../BACKLOG.md`) — the worker and the manual editor
share one validator. A candidate that fails stage 4 is not just an error; it is an
escalation **signal** (see below).

### Model routing — cheap-first, escalate on a tripwire

Day-to-day extraction uses cheap open models (DeepInfra / Fireworks). Frontier APIs
(Claude / OpenAI) are reserved for candidates that trip a **mechanical** tripwire — never
a vibe. Escalate when any holds:

- **Schema-validation failure** — emitted `category` / `condition_json` fails the stage-4
  Zod gate. Cheapest, strongest signal; already computed.
- **Ungrounded `clause_ref`** — the cited clause text is not found in the document
  `raw_text`. Catches invented policy terms, the most dangerous compliance hallucination.
- **Low cross-pass agreement** — two cheap passes (or two cheap models) disagree on the
  decision or a numeric threshold.
- **Low self-reported confidence** — below threshold; persisted to `gateway_confidence`.

Record which model produced each draft. Later, measure cheap-model precision against
analyst confirm/reject to tune the escalation threshold.

### Tooling and the language boundary

- **Parsing:** LlamaParse (the hosted PDF→structured API), not LlamaIndex-the-framework —
  there is no RAG/index requirement here, only parse + extract. The full RAG/LLM boundary
  (deterministic detection; retrieval only over documents; LLM narrates, never detects) is
  [ADR 0003](../adr/0003-retrieval-and-llm-boundary.md).
- **Orchestration:** prefer a plain function chain over a graph framework. Reach for
  LangGraph **only** if you need cyclic self-correction (extractor ↔ critic) or
  mid-graph human interrupts, and **only** over extraction — never over the gap analysis,
  which must stay deterministic ([`04-backtest.md`](04-backtest.md)).
- **Language:** see [ADR 0002](../adr/0002-extraction-service-language-boundary.md). For
  current scale (3–5 onboarding clients, low document volume, human-gated), the default is
  **all-TypeScript**: LlamaParse over REST + the Vercel AI SDK calling
  Fireworks/DeepInfra/Anthropic. Stand up a Python worker only when autonomous volume
  justifies the Python-first frameworks.

Whichever language, follow the existing suggest-only TS template:
`lib/ingestion/data-clerk.ts` (`annotateOpenExceptions`) and the dispute parser — both are
human-gated LLM calls that degrade gracefully when `ANTHROPIC_API_KEY` is absent.

## Today's state

There is no AI extractor yet. `addPolicyRule` is fully manual — staff hand-author
`condition_json` / `action_json`, and `addRuleAction` already validates the decision
against `GATEWAY_ACTIONS`. The human-confirm gate is therefore real *because a human is
the only author*. The structural controls above must be in place **before** the AI
extractor is wired in, not after.
