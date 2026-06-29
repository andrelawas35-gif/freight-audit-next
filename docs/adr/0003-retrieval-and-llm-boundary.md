# ADR 0003 — RAG / LLM boundary: deterministic detection, retrieval only over policy documents

- Status: Accepted (grilling session 2026-06-26)
- Deciders: Policy Intelligence grilling session
- Related: [ADR 0001](0001-backtest-shipment-context-model.md) (deterministic backtest),
  [ADR 0002](0002-extraction-service-language-boundary.md) (no LLM in gap analysis; RAG not
  adopted for extraction), [`../policy-intelligence/04-backtest.md`](../policy-intelligence/04-backtest.md),
  [`../data-protection.md`](../data-protection.md)

## Context

A proposal ("implement RAG for Audit & Forensic Reporting / a 'Compliance Brain'") asked to:
(a) store each client's rules as a **flat-file `policy.json`**; (b) have an **LLM read N
days of shipment logs and identify violations**; (c) generate a forensic report from that;
and (d) share the flat JSON between the gateway and the auditor.

This collides with the existing architecture:

- The "compliance schema per client" already exists as **`policy_rules.condition_json`** in
  Postgres — structured (invariant 9), **versioned** (effective-dated rulesets), and
  **tenant-isolated** (`../data-protection.md` RLS). Flat files regress all three.
- The "same JSON for gateway and audit" already exists: one `evaluatePolicyContext()` runs
  in `mode:'backtest'` and `mode:'pre_shipment'`.
- "An LLM identifies violations" contradicts the **reproducibility** requirement
  (`04-backtest.md`: same ruleset + period ⇒ same rows) and ADRs 0001/0002's deterministic
  gap analysis. The backtest is insurance-grade evidence; a hallucinated/missed violation
  destroys the trail.
- No RAG/embeddings/pgvector exist today (verified by grep). The only LLM uses are
  suggest-only, human-gated, structured-output (dispute parser, data clerk, planned
  extractor).

## Decision

(being grilled — recorded as branches lock)

- **D1 — Violation detection authority: LOCKED — deterministic code only.** The
  `evaluatePolicyContext()` / `matchesCondition()` evaluator is the **sole** authority on
  whether a shipment violated a rule. An LLM/RAG is **barred from the detection path**.
  Rationale: reproducibility is a hard requirement (`04-backtest.md`: same input ⇒ same
  rows; insurance-grade evidence), the code is tested and fast, the tri-state "unknown ≠
  compliant" is a correctness property an LLM can't guarantee, and this ratifies the
  existing ADRs 0001/0002 ("no LLM in the gap analysis"). LLMs appear only downstream
  (extraction draft suggestions, report narration), never inside the violation decision.
- **D2 — Rule source of truth: LOCKED — Postgres `policy_rules` only; flat files rejected.**
  Flat-file `policy.json` loses tenant isolation (no RLS/row-scoping — a tenant-leak
  regression), versioning/effective-dating (a single file collapses renewals to
  "latest wins" and corrupts historical backtests), the structured-data + human-review
  invariants (9/10: no `status`/draft-active/lineage), and expressiveness (flat scalars
  can't represent axis-crossing rules like `{shipperVertical, declaredValueGte, carrierIn}`).
  Both gateway and auditor already read `policy_rules` via the one evaluator — the
  proposal's "same source for both" is already satisfied, in the DB. **Carve-out:** a
  read-only JSON **export/snapshot** derived *from* the DB is allowed for backtest
  reproducibility snapshots and client deliverables — never an authority.
- **D3 — Legitimate retrieval surface: LOCKED — document-scoped, staff-facing, suggest-only.**
  Retrieval is allowed over the unstructured policy **documents** (stored PDFs), never the
  shipment logs or the rules. Two uses: (a) **clause grounding/citation** — verify a
  proposed rule's `clause_ref` exists in the document `raw_text`; this is keyword/section
  lookup within one client's one document, already specified as the extractor's
  "ungrounded clause_ref" tripwire (`02-extraction.md`), not a new RAG system. (b) **staff
  "ask the contract" assistant** — genuine NL Q&A over a client's policy corpus, but a
  suggest-only convenience for staff, **deferred**: it is blocked on document **blob
  storage** (`storage_key`/`checksum`, which `01-ingestion.md` flags may not exist yet) and
  on the extractor shipping. Build neither as a standalone "RAG system" now.
- **D4 — Retrieval substrate (if/when): LOCKED — tsvector first → pgvector-in-Neon → never
  flat files / external vector DB for V1.** Reject Pinecone/Weaviate (second datastore +
  second tenant-isolation boundary + compliance docs leaving custody). Reject flat-file
  index (no RLS/`client_id` scoping; embeddings are themselves sensitive — they can leak
  content). Use **Postgres full-text (`tsvector`) first** — for one client's handful of
  documents, keyword/section lookup beats embeddings on contract text with no embedding
  pipeline. Add **pgvector in Neon** only when semantic queries demonstrably beat keyword;
  it keeps embeddings in the same Postgres/RLS/restricted-role/backup boundary as
  `policy_documents` (one datastore, one isolation model). Any index is `client_id`-scoped
  and RLS-protected — a cross-tenant retrieval is the same leak as a bad JOIN.
- **D5 — Report generation: LOCKED — LLM narrates deterministic findings, never detects.**
  The deterministic backtest produces violations/dollars/categories/clause refs
  (`policy_backtest_results`); an LLM receives **those fixed facts** and writes the
  `05-readiness.md` "Compliance Intelligence Package" prose. Guardrails: the model gets
  structured results only and may introduce no violation/amount/clause not in the input;
  **numbers are code-rendered** (interpolated from rows, never transcribed by the model);
  **suggest-only** (analyst reviews before client delivery, invariants 4/10); every prose
  claim traces to a result row + `clause_ref`. **Deferred** until the deterministic backtest
  is correct (the `04-backtest.md` effective-dating / shipment-spine gaps are still open) —
  narrating wrong numbers prettily is worse than no narration. It is strictly a *writer*
  over fixed facts; it never computes or detects.

## Summary: the LLM/retrieval boundary

```text
DETECTION (what was violated)      → deterministic evaluator ONLY (D1)        [exists]
RULE SOURCE OF TRUTH               → Postgres policy_rules ONLY (D2)          [exists]
RETRIEVAL (over documents)         → clause grounding [in extractor] +
                                     deferred staff "ask the contract" (D3)   [deferred]
RETRIEVAL SUBSTRATE                → tsvector → pgvector-in-Neon (D4)         [deferred]
GENERATION (the report prose)      → LLM narrates fixed facts, suggest-only (D5) [deferred]
```

LLMs touch the **edges** (extraction in, narration out); deterministic code owns the
**core** (detection). RAG, where it exists at all, is document-scoped, tenant-isolated,
staff-facing, and suggest-only — never the "Compliance Brain that decides violations" the
proposal described.

## Consequences

- The proposal's "Flat File RAG / LLM-reads-logs" is **not adopted**; it would regress
  tenant isolation, effective-dating, the structured-data/human-review invariants, and
  reproducibility. Its one good instinct (one source feeds gateway + auditor; an AI drafts
  the report) is preserved via the existing dual-mode evaluator (D2) and the suggest-only
  narrator (D5).
- No new datastore and no embedding pipeline are built speculatively. Retrieval, when
  built, stays inside the one Neon/RLS isolation boundary (D4).
- Nothing here is V1: clause grounding rides the (unbuilt) extractor; the staff assistant
  and the narrator are deferred behind blob storage and a correct backtest respectively.
- Consistent with and extends ADRs 0001/0002: deterministic gap analysis, LLMs suggest-only
  at the edges.

## Alternatives considered

- **Flat-file `policy.json` "Flat File RAG".** Rejected — regresses invariant 9, RLS,
  effective-dating, expressiveness (D2).
- **LLM-as-detector over raw logs.** Rejected — non-reproducible; contradicts ADRs
  0001/0002 and the insurance-grade audit trail (D1).
- **External vector DB (Pinecone/Weaviate) or on-disk index.** Rejected for V1 — second
  isolation boundary / compliance docs leaving custody / no RLS (D4).
