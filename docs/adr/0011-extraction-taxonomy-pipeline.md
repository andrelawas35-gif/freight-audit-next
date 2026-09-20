# ADR 0011 — AI Extraction & Taxonomy Discovery Pipeline

- **Status**: SUPERSEDED (extraction portions replaced by ADR 0012; taxonomy discovery D5/D6 remain valid)
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session)
- **Related**: ADR 0002 (extraction language boundary), ADR 0003 (LLM boundary), ADR 0008 (grilling schema contract), 02-extraction.md, 03-taxonomy.md, 07-schema-evolution.md

## Context

The policy intelligence system has a fully designed but unimplemented AI extraction pipeline. Today, `addPolicyRule` is entirely manual — staff hand-author `condition_json`/`action_json` for every rule. There is no AI extractor, no taxonomy discovery mechanism, and a known capture/enforce gap: `TEMPERATURE_CONTROL_MISSING` exists as a category in the taxonomy but has no corresponding `PolicyCondition` key or evaluator logic, making it inert.

The platform's invariants require AI to be suggest-only (invariant 4), policy intelligence to be structured data not notes (invariant 9), and policy activation to be human-reviewed (invariant 10). The extraction design lives in `docs/policy-intelligence/02-extraction.md`, the taxonomy in `03-taxonomy.md`, and the discovery mechanism in `07-schema-evolution.md`.

This ADR records six architectural decisions from a grilling session about how to sequence, trigger, review, and govern the extraction pipeline — and how to close the existing capture/enforce gap before wiring AI.

---

## Decision 1: Sequencing — Temperature Gap First, Then Extraction, Then Taxonomy Discovery

**Decision**: Ship in three phases:
- **Phase 0**: Temperature gap closure — deterministic, no AI. Add `temperatureMax`/`temperatureControlRequired` to `PolicyCondition`, evaluator branch, and backtest case. Proves the full `captured → extractable → storable → enforceable` lifecycle on a known category.
- **Phase 1**: AI extraction pipeline — async, queued, human-reviewed. The 6-stage pipeline from `02-extraction.md` (parse → classify → extract → validate → escalate → emit). Output lands in a "Suggested Rules" review panel.
- **Phase 2**: Taxonomy discovery + candidate registry + staff review UI. The `policy_taxonomy_candidates` table, L3 novelty detection, cross-client dedupe, and `taxonomy_admin` promotion workflow from `07-schema-evolution.md`.

**Rationale**: The temperature gap is fully deterministic — zero AI risk, small scope, and it proves the lifecycle works end-to-end on a variable that already has a taxonomy category. It builds confidence in the `PolicyCondition` + evaluator + backtest pattern before the AI extractor is wired in. Extraction (Phase 1) is the revenue-unlocking work — it turns policy documents into structured draft rules. Taxonomy discovery (Phase 2) is the moat-builder — it learns the industry's vocabulary across clients. Sequencing them this way minimizes risk and maximizes learning.

**Consequences**:
- Phase 0 is a standalone deliverable with its own verification (evaluator test + backtest).
- Phase 1 depends on Phase 0's `PolicyCondition` extension pattern being proven.
- Phase 2 depends on Phase 1's extractor existing (the tripwire that detects L3 novelty is a stage-4 extractor outcome).

**Alternatives considered**: Ship all three in parallel (dangerous — Phase 2's discovery tripwire needs Phase 1's extractor; Phase 1's Zod validation needs Phase 0's `PolicyCondition` baseline). Ship extraction first and defer temperature gap (leaves a known-inert category in the taxonomy while adding new ones — compounds the capture/enforce gap).

---

## Decision 2: Model Strategy — Degrade Pattern, Cheap-First Escalation

**Decision**: The extractor follows the existing LLM degrade pattern used by the dispute parser (`lib/ingestion/dispute-parser.ts`) and data clerk (`lib/ingestion/data-clerk.ts`):
- If only `ANTHROPIC_API_KEY` is available, route all extraction there. No cheap model required.
- If a cheap provider (Fireworks/DeepInfra) is also configured, implement the full cheap-first escalation with four mechanical tripwires from `02-extraction.md`: schema validation failure, ungrounded `clause_ref`, low cross-pass agreement, low self-reported confidence.
- If no LLM key is configured, extraction is unavailable — the "Extract Rules" button shows a disabled state with a message.

**Rationale**: The platform already degrades gracefully when `ANTHROPIC_API_KEY` is absent. Adding a hard requirement for a second provider creates deployment friction for zero business value at current document volume (3–5 onboarding clients). The cheap-first escalation architecture is designed into the routing function — it activates when cheap providers are configured, silently routes-to-frontier when they aren't. No code changes needed to switch modes.

**Consequences**:
- Day one: extraction works with the existing `ANTHROPIC_API_KEY` env var.
- Day N: adding `FIREWORKS_API_KEY` or `DEEPINFRA_API_KEY` env vars activates cheap-first routing automatically.
- The extractor's `model_used` column records which model produced each suggestion — essential for later cost/accuracy tuning.

**Alternatives considered**: Require cheap provider + Anthropic from day one (extra infra for no volume). OpenAI as default cheap provider (adds a third API key dependency; Anthropic is already configured).

---

## Decision 3: Extraction Trigger — Manual, Staff-Initiated

**Decision**: Document upload (via portal multi-type upload or staff console) triggers **only** LlamaParse (stage 1 — deterministic, no AI). The document status shows "Parsed — ready for extraction." A staff member must explicitly click "Extract Rules" from the policy detail page to enqueue a `policy_extract` job (stages 2–6). The job rides the existing `audit_jobs` queue with `FOR UPDATE SKIP LOCKED`.

**Rationale**: Invariants 4 and 10 require AI to be suggest-only and activation to be human-reviewed. Automatic extraction on upload crosses the human-gate boundary before a human has confirmed they even want rules from this document. Manual trigger keeps the human in the loop from the start, at the cost of one click. The existing job queue infrastructure (`audit_jobs`, `FOR UPDATE SKIP LOCKED`, the `process` API route) is already production-proven — no new orchestrator.

**Consequences**:
- Upload is fast (LlamaParse only, <5s for typical documents).
- Extraction is async — staff enqueues and the job processes in the background.
- The document detail page needs an "Extract Rules" button with status indicators (idle → queued → processing → complete).
- If LlamaParse is unavailable (no API key), documents are stored as raw blobs with status "Received — parsing unavailable."

**Alternatives considered**: Full auto on upload (violates suggest-only invariant). Hybrid — auto-parse + auto-extract for policy docs only (inconsistent; all documents should follow the same trust boundary).

---

## Decision 4: Extraction Output — Separate "Suggested Rules" Review Panel

**Decision**: Extracted rules land in a dedicated "Suggested Rules" panel on the policy detail page, not directly in the rules table. Each suggestion displays:
- The proposed `rule_key`, `category`, `condition_json`, and `action_json`
- The source clause text (extracted from document, with highlighting)
- Confidence score and model attribution
- Staff actions: **Confirm** (promotes to draft `policy_rule` with `signal_source='AI_SUGGESTED'`), **Edit** (staff modifies, then confirms), **Reject** (discarded with optional reason)

**Rationale**: The suggest-only boundary should be *visible*, not just a DB column. A separate panel makes it obvious which rules are human-authored vs AI-proposed. It also provides a natural place for grounding evidence (clause text highlighting) and confidence metadata that the rules table doesn't display. The panel is the structural enforcement of invariant 4 — AI output cannot become a rule without explicit staff promotion.

**Consequences**:
- New component: `components/console/suggested-rules-panel.tsx` or similar.
- New server actions: `confirmSuggestion`, `rejectSuggestion`, `editAndConfirmSuggestion`.
- Suggested rules are stored in `policy_rule_suggestions` (or as `policy_rules` with `status='suggested'`, `signal_source='AI_SUGGESTED'` — exact table to be resolved during schema design).

**Alternatives considered**: Direct to rules table as `status='draft'` (blurs human/AI boundary, no place for source evidence display). Inline suggestions within the rule editor (complex UX, harder to batch-review).

---

## Decision 5: `taxonomy_admin` — Capability Flag, Not Role Enum

**Decision**: `taxonomy_admin` is implemented as a boolean capability flag (`is_taxonomy_admin`) on the `app_users` table, **not** as a third value in the `role` enum. The flag gates the `promoteCandidate` server action. It is surfaced in the JWT token and session alongside the existing `role` field. The users admin page gets a checkbox.

**Rationale**: Adding a third role value to `role` touches middleware, JWT callbacks, session types, and every `role === 'staff'` check across the codebase. A boolean flag is additive — no role migration, no auth middleware change, no risk of accidentally locking a `taxonomy_admin` out of the staff console. For the foreseeable future, one person holds this flag. If role hierarchy ever becomes complex, it can be refactored — but at 3–5 clients, a flag is correct.

**Consequences**:
- Migration: `ALTER TABLE app_users ADD COLUMN is_taxonomy_admin BOOLEAN DEFAULT FALSE`.
- JWT callback adds `token.isTaxonomyAdmin = user.is_taxonomy_admin`.
- Session type adds `isTaxonomyAdmin?: boolean`.
- `promoteCandidate` server action checks `session.user.isTaxonomyAdmin`.
- Staff review UI shows promote/reject buttons only if `isTaxonomyAdmin`.

**Alternatives considered**: New role value `'taxonomy_admin'` (touches too much auth surface for a single-action gate). Defer the role entirely — all staff can promote (ok for launch but loses the gating that `07-schema-evolution.md` D3 explicitly calls for as "cheap now, expensive to retrofit").

---

## Decision 6: Upload-to-Extraction Handoff — Decoupled

**Decision**: The multi-type upload (Wave C) and the extraction pipeline are decoupled. Upload stores the document with status `'received'` (or `'parsed'` after LlamaParse). The policy detail page in the staff console shows uploaded documents with a "Parse & Extract" button per document. Client portal upload is a data ingress action; extraction is a staff console action. They share the document store but are triggered independently.

**Rationale**: Upload is a client-facing action (portal); extraction is a staff-facing action (console). Coupling them would mean client uploads trigger AI processing — crossing the suggest-only boundary from the wrong side. The upload-router's existing pipeline messages already describe what happens next ("Your insurance policy will be reviewed for coverage rules...") without promising automatic processing. This keeps the trust boundary clean: clients supply data, staff controls AI.

**Consequences**:
- The existing `upload_logs` table and `recordDocumentUpload()` function need no changes — they already support `document_type`.
- The policy detail page (`app/(console)/console/policies/[policyId]/page.tsx`) needs a document list section with per-document action buttons.
- No changes to `lib/portal/upload-router.ts` or portal upload flow.

**Alternatives considered**: Full coupling — upload auto-triggers extraction (violates human-gate invariant). Hybrid — auto-parse but manual extraction (this is already the design; parse is deterministic, extraction is AI).

---

## Implementation Phases

### Phase 0 — Temperature Gap Closure (deterministic, no AI)
1. Add `temperatureMax` (integer, optional) and `temperatureControlRequired` (boolean, optional) to `PolicyCondition` type in `lib/intelligence/policy-evaluator.ts`
2. Add evaluator branch: if `temperatureControlRequired && !temperatureServiceSelected → WARN` with message "Temperature-controlled service required for this shipment"
3. Add backtest case in `lib/intelligence/__tests__/policy-evaluator.test.ts`
4. Verify: evaluator test passes, backtest case fires correctly

### Phase 1 — AI Extraction Pipeline
1. Add `policy_extract` job type to `audit_jobs` (reuse existing queue infrastructure)
2. Implement 6-stage extraction worker in `lib/intelligence/extraction/`:
   - `parse.ts` — LlamaParse REST call (document → structured text)
   - `classify.ts` — LLM: identify document type + relevant clauses
   - `extract.ts` — LLM: clauses → candidate `policy_rules` JSON
   - `validate.ts` — Zod gate against `GATEWAY_ACTIONS` + taxonomy categories
   - `escalate.ts` — 4 tripwires; route to frontier model if triggered
   - `emit.ts` — write suggestions to store, update document status
3. Create `components/console/suggested-rules-panel.tsx` — review UI
4. Add server actions: `triggerExtraction`, `confirmSuggestion`, `rejectSuggestion`
5. Wire into policy detail page

### Phase 2 — Taxonomy Discovery + Review UI
1. Migration: `policy_taxonomy_candidates` table (Tier-0 metadata)
2. Extractor stage-4 change: grounded + unmappable → frontier escalation → upsert candidate
3. Add `is_taxonomy_admin` column to `app_users` + JWT/session plumbing
4. Staff review UI: ranked candidate queue, promote/reject
5. `promoteCandidate` server action (gated by `taxonomy_admin`)

---

## Route Map (Phase 1+2 additions)

```
/console/policies/[policyId]              → Policy detail with documents + suggested rules
/console/policies/[policyId]/extract      → Trigger extraction (server action, no page)
/console/taxonomy                         → Taxonomy candidate review queue (taxonomy_admin only)
/api/run-audit/process                    → Extended to handle policy_extract job type (existing route)
```

---

## Consequences Summary

| Dimension | Impact |
|-----------|--------|
| **Schema** | New: `policy_rule_suggestions` (or `policy_rules.status='suggested'`), `policy_taxonomy_candidates`. Migration: `is_taxonomy_admin` on `app_users` |
| **Auth** | JWT + session gain `isTaxonomyAdmin` field. No role enum changes |
| **Job queue** | New `policy_extract` job type. Reuses existing `audit_jobs` + `FOR UPDATE SKIP LOCKED` |
| **AI surface** | New degrade-gated LLM calls (extraction). All output is suggest-only, never auto-applied |
| **Upload** | No changes. Decoupled from extraction |
| **Trust boundary** | Preserved: AI output requires explicit staff confirmation; taxonomy promotion requires `taxonomy_admin`; client uploads never trigger AI |
| **Cost** | LlamaParse per document (~$0.01-0.05). LLM calls per extraction (cheap model: ~$0.001-0.01; frontier escalation: rare) |
