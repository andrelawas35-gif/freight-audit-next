# ADR 0012 — 4-Tier Extraction & Classification Architecture

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session — user proposal + Controller analysis)
- **Supersedes**: ADR 0011 extraction decisions (D2, D3, D4); ADR 0011 taxonomy discovery (D5, D6) and Phase 0 temperature gap remain valid
- **Related**: 02-extraction.md, 03-taxonomy.md, 07-schema-evolution.md, ADR 0002, ADR 0011

## Context

ADR 0011 designed a 6-stage extraction pipeline (parse → classify → extract → validate → escalate → emit) where all policy document clauses flow through LlamaParse → cheap-model LLM → optional escalation to frontier models. Ambiguous results route to staff review in a "Suggested Rules" panel.

A grilling session produced a materially better architecture: a **4-tier classification system** that separates deterministic matching (Tier 1), LLM data mapping (Tier 2), semantic caching (Tier 3), and client-facing ambiguity resolution (Tier 4). The key innovations are: (a) a zero-cost, zero-latency deterministic first pass that catches standard clauses via phrase matching; (b) a vector memory bank that eliminates re-extraction of semantically identical clauses across clients; and (c) routing ambiguous clauses to **clients** for explicit definition or exclusion, turning a software limitation into a premium compliance workflow that protects the platform from assumed risk.

This ADR records 7 architectural decisions that replace ADR 0011's extraction design.

---

## Decision 1: 4-Tier Classification Replaces 6-Stage Extraction Pipeline

**Decision**: Replace ADR 0011's linear 6-stage extraction pipeline with a 4-tier classification architecture:

```
DOCUMENT UPLOAD
    │
    ▼
┌─────────────────────────────────────────────┐
│ TIER 1 — DETERMINISTIC TOKENIZER            │
│ Phrase/pattern matching against known       │
│ rule_keys. Standard clauses caught without  │
│ API latency. ~40-60% coverage expected.     │
│ Cost: $0. Latency: <5ms per clause.         │
└──────────────┬──────────────────────────────┘
               │ unmatched clauses
               ▼
┌─────────────────────────────────────────────┐
│ TIER 2 — LLM DATA MAPPER                    │
│ Maps clause text → existing PolicyCondition │
│ keys only. Zod-validated against schema.    │
│ If no schema key fits → escalate to T4.     │
│ Cost: cheap-model first, frontier on trip.  │
└──────────────┬──────────────────────────────┘
               │ classified clause
               ▼
┌─────────────────────────────────────────────┐
│ TIER 3 — VECTOR MEMORY BANK                 │
│ Semantic embedding of classified clauses.   │
│ Future near-match → instant T1-equivalent   │
│ resolution. Caches across clients.          │
│ Cost: pgvector write on first-seen only.    │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ TIER 4 — CLIENT AMBIGUITY DASHBOARD         │
│ Clauses that couldn't map → client-facing   │
│ "Define / Exclude / Flag for Review"        │
│ workflow. Client owns the decision.         │
│ Excluded clauses → written scope statement. │
└─────────────────────────────────────────────┘
```

**Rationale**: ADR 0011's pipeline treats every clause as needing AI — serial LlamaParse → LLM → validation. The 4-tier architecture inserts deterministic and cached resolution steps that eliminate LLM calls for known patterns, and redirects ambiguity from staff (cost center) to clients (revenue feature). The pipeline is shorter in the happy path (T1 match → done) and smarter in the hard path (T4 gives clients control, not staff burden).

**Consequences**:
- T1 catches standard clauses instantly — no API key required, works even when LLM providers are down.
- T3 accumulates value over time — the more documents processed, the fewer LLM calls needed.
- T4 is a new product surface — the "Compliance Definition Workflow" is a premium feature, not a support queue.
- ADR 0011's LlamaParse→cheap→frontier chain still exists inside T2, but T2 only runs for clauses T1 couldn't match.
- The `policy_extract` job type is replaced by a tiered processing job.

**Alternatives considered**: Keep ADR 0011 linear pipeline and add caching as an optimization (adds complexity without the architectural clarity of tier separation). Skip T1 and rely on T3 warm-up (loses the zero-cost cold-start advantage — T1 works on document one).

---

## Decision 2: T1 Deterministic Tokenizer — Regex/Phrase Matching Seeded from rule_key Namespace

**Decision**: T1 is a pure function — no API calls, no async I/O, no database reads. It takes clause text as input, runs a set of phrase patterns against it, and returns either a matched `rule_key` + extracted parameters or `null` (unmatched — pass to T2).

The tokenizer is seeded from the existing `rule_key` namespace. Each known rule key gets one or more phrase patterns:

| rule_key | Example Phrase Patterns |
|----------|------------------------|
| `declared_value_limit` | "declared value shall not exceed $X", "maximum declared value of $X", "shipments valued over $X require" |
| `adult_signature_required` | "adult signature required", "signature required for shipments over $X", "direct signature required" |
| `third_party_insurance_required` | "third-party insurance required", "shipper must maintain cargo insurance", "separate insurance policy required" |
| `carrier_excluded` | "shall not be shipped via [carrier]", "not authorized for [carrier]", "excluded carrier" |

Parameters (dollar amounts, carrier names, thresholds) are extracted via named capture groups in the regex patterns. The output is a partial `PolicyCondition` + `PolicyAction` ready for T2 validation or direct promotion.

**Rationale**: Insurance policies use highly standardized language. "Declared value shall not exceed $25,000 per shipment" is not novel — it's a template. Regex patterns catch these instantly. The existing `rule_key` namespace already defines 25+ stable machine keys — we're not inventing new keys, just recognizing when documents reference them. The tokenizer is a `lib/intelligence/tokenizer.ts` file, not a service — it runs in-process with zero deployment overhead.

**Consequences**:
- T1 patterns must be maintained as new rule_keys are added — each new key needs at least 3 phrase patterns. This is a one-time cost per key, amortized across all documents.
- Pattern collisions (two rules matching the same clause) must be resolved by specificity scoring — longer match wins, exact match beats partial.
- The tokenizer is the first thing tested in extraction tests — if it misclassifies, the LLM never gets a chance to correct it.
- No API key dependency — T1 works in all deployment environments including local dev.

**Alternatives considered**: Embedding-based similarity for T1 (defeats the purpose — costs API calls, adds latency, T3 handles that case). Keyword-only matching without regex (too brittle — can't extract dollar amounts, carrier names). Skip T1 entirely and rely on T3 warm-up (loses the cold-start advantage — T1 works on document one, T3 needs prior examples).

---

## Decision 3: T2 LLM Data Mapper — Strict Schema Alignment Only

**Decision**: T2 is an LLM call that maps unmatched clause text → `PolicyCondition` keys. The LLM prompt is constrained to **only** output keys that exist in the current `PolicyCondition` type. It is a data mapper, not a creative extractor — if a clause describes a constraint that doesn't map to any existing key, the LLM must respond with `{ "mapped": false, "reason": "..." }` rather than inventing a key.

The output is Zod-validated against `PolicyCondition` before acceptance. Any key not in the allowlist is rejected — the LLM cannot expand the schema.

The degrade pattern from ADR 0011 D2 is preserved: cheap-model first (if configured), escalate to Anthropic on tripwires (schema validation failure, ungrounded clause_ref, low confidence, cross-pass disagreement).

**Rationale**: The LLM's job is mapping, not invention. "All jewelry shipments must have adult signature" → `{ signatureRequiredAbove: 0, shipperVertical: "jewelry", signatureTypeIn: ["adult"] }`. This is a translation task, not a reasoning task — the schema is the target, and the LLM's value is parsing natural language into structured JSON within that target. Constraining it to existing keys prevents schema drift and ensures T1 patterns can be written for commonly mapped clauses.

**Consequences**:
- T2 costs scale with T1 miss rate. As T1 patterns improve, T2 volume decreases.
- The `{ mapped: false }` response is not a failure — it's the trigger for T4.
- T2 errors (hallucinated keys, malformed JSON) are caught by Zod validation and escalated to frontier models or T4.
- ADR 0011's `model_used` column records which LLM produced each mapping for precision tracking.

**Alternatives considered**: Let the LLM propose new keys (creates schema drift — new keys bypass T1 and T3, accumulate unmaintained). Skip T2 and go straight to T4 for unmatched clauses (overly conservative — many clauses are standard but phrased differently; T2 handles these).

---

## Decision 4: T3 Vector Memory Bank — pgvector, Cross-Client Deduplication

**Decision**: After T1 or T2 classifies a clause, its text is embedded and stored in a `clause_embeddings` table (pgvector extension on Neon). Before T2 is invoked for an unmatched clause, T3 checks for a near-match in existing embeddings. If a semantically identical clause was previously classified (by T1 or T2 for any client), T3 returns the cached classification and skips T2.

The `clause_embeddings` table stores:
- `clause_text` — the original clause text
- `embedding` — pgvector(1536) or model-specific dimension
- `classified_rule_key` — the resolved rule_key
- `classified_condition_json` — the resolved condition JSON
- `classification_source` — `'tokenizer'` or `'llm_mapper'`
- `match_count` — how many times this embedding has been hit
- `first_seen_at`, `last_matched_at`

Embeddings are generated via the cheapest available embedding model (Anthropic/OpenAI embeddings API, or a local model). Similarity threshold is configurable — initial value 0.92 cosine similarity.

**Rationale**: This is the moat. Insurance policies from different carriers use identical or near-identical language for standard clauses. Once "jewelry shipments over $25,000 require third-party insurance" is classified for Client A, Client B's Zurich policy with the same clause should match instantly — zero LLM cost, zero latency. The memory bank accumulates value with every document processed and every client onboarded. It also catches T1 misses — if T1 doesn't have a pattern for a clause but T2 classified it, T3 caches T2's work so the next occurrence is a T3 hit.

**Consequences**:
- Embedding API cost is paid once per unique clause, not per document.
- Match count tracks which clauses are most common across clients — these should have T1 patterns written for them (feedback loop from T3 → T1).
- pgvector is available on Neon — no external vector database required.
- Embeddings are not client-specific — they're cross-tenant by design (clauses are language, not data).
- If no embedding API key is configured, T3 is skipped (degraded gracefully — same as T2's degrade pattern).

**Alternatives considered**: External vector database (Pinecone, Weaviate) — adds operational complexity and cost for a single-table use case. Client-scoped embeddings (defeats the purpose — the value is cross-client deduplication). Skip T3 entirely (acceptable for the first 3-5 clients, but linear cost scaling makes it untenable at 20+ clients).

---

## Decision 5: T4 Client Ambiguity Dashboard — Define / Exclude / Flag

**Decision**: Clauses that T2 cannot map to existing `PolicyCondition` keys route to a **client-facing** "Compliance Definition" panel in the portal (not a staff-only review panel as in ADR 0011 D4). The client sees:

1. The source clause text (highlighted in the original document)
2. A plain-English summary: "This clause requires something our system doesn't yet track. How should we handle it?"
3. Three actions:
   - **Define** — Client provides a clear operational definition. This creates a draft rule with `signal_source='CLIENT_DEFINED'` that staff reviews and activates. The definition may require a new `PolicyCondition` key (triggers a schema change request) or map to an existing key the LLM missed.
   - **Exclude** — Client explicitly excludes this clause from enforcement. Creates a written scope statement exclusion: "Section 4.3 is acknowledged but not operationally enforced." The exclusion is timestamped and attested. Future coverage gaps related to this clause are suppressed.
   - **Flag for Review** — Client escalates to Aurelian staff for analysis. Falls back to the ADR 0011 staff review workflow as an exception path, not the default.

**Rationale**: ADR 0011 routes all ambiguity to staff — a cost center that scales with client count. T4 routes ambiguity to clients — a premium compliance workflow where the client explicitly defines their risk posture. This protects Aurelian from assumed risk ("you said you'd catch everything") and over-promising ("your system flagged nothing, so we're compliant"). An excluded clause is a written record that the client chose not to enforce it — it's their decision, not the platform's oversight.

This also completes the attestation loop started in ADR 0009 D7. Attestation says "I confirm these rules are correct." T4 says "these clauses couldn't become rules — I'm explicitly excluding them." Both are binding governance records.

**Consequences**:
- The T4 panel is a new portal surface — part of the Compliance tab or a standalone "Policy Review" page.
- `signal_source='CLIENT_DEFINED'` is a new value for the taxonomy's `gatewaySignalSource` enum.
- The `policy_scope_exclusions` table stores excluded clauses with client attestation timestamps.
- Staff can override client decisions (promote an excluded clause to a rule if they spot a mapping the LLM and client missed), but the default is client-owned.
- If a client excludes a clause that later causes a coverage gap, the gap report shows "Excluded by client on [date]" — not "System failed to detect."

**Alternatives considered**: Staff-only ambiguity review (ADR 0011 D4 — cost center, doesn't scale). Auto-exclude ambiguous clauses silently (dangerous — hides risk from clients, creates legal exposure). Force all clauses to be operational (impossible — some clauses are genuinely non-computational, e.g., "The shipper shall comply with all applicable laws").

---

## Decision 6: Sequencing — T1 First, Then T2+T3, Then T4

**Decision**: Implementation phases:

- **Phase 0 (already designed — ADR 0011 D1)**: Temperature gap closure. Deterministic, no AI. Remains unchanged.
- **Phase 1**: T1 Deterministic Tokenizer. `lib/intelligence/tokenizer.ts` with 15–20 phrase patterns covering the most common `rule_key`s. Tests verify pattern matching and parameter extraction. This is a standalone deliverable — no LLM, no vector DB, no portal changes. It proves the T1 concept before wiring T2.
- **Phase 2**: T2 LLM Data Mapper + T3 Vector Memory Bank. T2 reuses ADR 0011's degrade pattern and Zod validation. T3 uses pgvector on Neon. T1→T2→T3 in sequence, with T3 providing the feedback loop to T1 (common T3 matches → new T1 patterns).
- **Phase 3**: T4 Client Ambiguity Dashboard. Portal surface, `policy_scope_exclusions` table, Define/Exclude/Flag workflow, `CLIENT_DEFINED` signal source. Depends on T2 existing (T4 only triggers when T2 returns `{ mapped: false }`).

ADR 0011's taxonomy discovery (Phase 2 — `policy_taxonomy_candidates`, L3 detection, `taxonomy_admin`) remains valid and unchanged. It is now Phase 4, sequenced after the 4-tier pipeline is fully operational.

**Rationale**: Each phase delivers standalone value. T1 alone reduces extraction costs to zero for standard clauses — deployable in a day. T2+T3 add AI with caching — deployable in a sprint. T4 is the product-level differentiator — needs design polish and portal integration. Sequencing them this way means each phase can ship, be tested, and generate ROI before the next begins.

**Consequences**:
- Phase 1 has the lowest risk and highest immediate ROI — T1 catches 40-60% of clauses with zero dependencies.
- Phase 2's T3 feedback loop means T1 patterns improve over time without manual effort.
- Phase 3 is gated on having real client documents processed through T1+T2 — you need to know what T4 will actually show before building it.
- ADR 0011's `policy_extract` job type is replaced by a `policy_classify` job that runs the tiered pipeline.

**Alternatives considered**: Ship all tiers at once (high risk — T4 needs real T2 output to validate the UX; T3 needs T2 to exist to generate embeddings). Ship T4 first (backwards — nothing to display without T2 classification). Skip T1 and start with T2+T3 (acceptable, but T1 is a one-day build for immediate cost savings).

---

## Decision 7: ADR 0011 Partial Retention

**Decision**: ADR 0011's following decisions remain valid and unchanged:
- **D1 Phase 0**: Temperature gap closure (deterministic, no AI)
- **D5**: `taxonomy_admin` as boolean capability flag on `app_users`
- **D6**: Upload-to-extraction decoupling (client uploads, staff triggers)
- **Phase 2**: Taxonomy discovery — `policy_taxonomy_candidates`, L3 novelty detection, staff review UI, promotion workflow

ADR 0011's superseded decisions:
- **D1 Phase 1-2**: 6-stage extraction pipeline → replaced by 4-tier classification
- **D2**: Model strategy — cheap-first escalation preserved inside T2, but the overall architecture is different
- **D3**: Manual extraction trigger — preserved (staff still clicks "Classify"), but the processing is tiered, not serial
- **D4**: Staff-only "Suggested Rules" panel → replaced by T4 client ambiguity dashboard

**Rationale**: ADR 0011 was accepted but never deployed. The taxonomy discovery design (L3 novelty detection, promotion lifecycle, `taxonomy_admin` flag) is sound and doesn't intersect with the classification pipeline. Keeping those decisions avoids re-litigating them.

**Consequences**:
- ADR 0011 is marked SUPERSEDED for extraction portions.
- Taxonomy discovery (0011 D5, D6, Phase 2) continues to be the authority for that concern.
- This ADR (0012) is the authority for extraction and classification.

---

## Consequences Summary

| Dimension | Impact |
|-----------|--------|
| **Cost scaling** | T1 catches ~40-60% at $0. T3 caches T2 results, reducing repeat LLM calls. Costs grow sub-linearly with document volume. |
| **Latency** | T1: <5ms. T3 hit: <10ms. T2: 500-2000ms. T4: human-scale. |
| **Risk** | T4 shifts legal risk from platform to client — excluded clauses are client decisions, not platform oversights. |
| **Product surface** | T4 is a premium compliance workflow. "Policy Review" becomes a consulting product, not a support cost. |
| **Infrastructure** | pgvector on Neon (existing infrastructure). No new services. |
| **ADR 0011** | Superseded for extraction; taxonomy discovery (D5, D6, Phase 2) intact. |

## Implementation Phases

| Phase | What | Depends On | Delivers |
|-------|------|------------|----------|
| 0 | Temperature gap (ADR 0011) | Nothing | TEMPERATURE_CONTROL_MISSING enforceable |
| 1 | T1 Tokenizer | Phase 0 | Zero-cost classification for standard clauses |
| 2 | T2 LLM Mapper + T3 Vector Bank | Phase 1 | AI classification + semantic caching |
| 3 | T4 Client Ambiguity Dashboard | Phase 2 | Define/Exclude/Flag workflow + scope exclusions |
| 4 | Taxonomy discovery (ADR 0011 retained) | Phase 2 | L3 novelty detection + candidate registry |

## Route Map

| Surface | Route | Tier | Purpose |
|---------|-------|------|---------|
| Staff Console | `/policies/[policyId]/classify` | T1-T3 trigger | Staff clicks "Classify Rules" — runs tiered pipeline |
| Staff Console | `/policies/[policyId]/rules` | T1-T3 output | Suggested rules from T1/T2, ready for staff confirmation |
| Client Portal | `/portal/policy-review` | T4 | Client ambiguity dashboard — Define/Exclude/Flag |
| Client Portal | `/portal/compliance` | T4 output | Scope statement with exclusions |
