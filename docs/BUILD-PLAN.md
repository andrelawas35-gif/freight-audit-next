# Build Plan — Multi-Agent Execution (planning)

> **STATUS: EXECUTED (2026-06-26).** All 4 phases complete. E1 Keystone (contract freeze,
> migration 0006), E2 Backtest (8 correctness fixes, migration 0007), E3 Gateway (Next.js
> API route `/v1/precheck`, ADR 0004 refactor from Fastify), E4 Policy UI (attestation, scope
> statement, guarantee). E5 Launch Readiness shipped alongside. E6 Extraction deferred.
> All 295 tests pass, TypeScript clean.
> See `../CHANGELOG.md` for full implementation details.

## Framing (what this adapts and what it rejects)

The "Controller / multi-agent" framework is adopted for **discipline** (single-writer,
contract-freeze, doc-scoped context routing) but **not for maximalism**:

- **Reject "maximize parallelization."** The work is a **critical path with two side
  branches**, not a balanced fan-out. One track (backtest correctness) gates revenue
  (`09` DP1). Solo founder → bottleneck is review/integration, not writing throughput.
  Past ~4 well-separated tracks the coordination tax exceeds the speedup.
- **Keystone is NOT "a new data layer"** — that exists (`db/schema.ts`, `lib/db.ts`, 5
  migrations). The keystone is the **frozen shared contract** (below).

## Decisions

### D1 — Granularity + Keystone: **4 agents on real seams; keystone = the frozen shared contract** — LOCKED
- **Keystone (Phase 0, frozen before fan-out) = the shared contract:** `db/schema.ts` +
  new migrations + the tenancy/RLS layer (`data-protection.md`) + the evaluator TS types
  (`ShipmentPolicyContext` / `PolicyCondition` / `PolicyDecision`, `policy-evaluator.ts`) +
  the `taxonomy.ts` closed enums. Every track reads or writes against these.
- **4 agents, not 6+,** aligned to non-overlapping directories (D2), sequenced by the
  critical path (D3).

### D2 — Ownership map: **6 engineers, non-overlapping dirs; gateway in-repo** — LOCKED

**Alias:** A0↔E1, A1↔E2, A2↔E3, A3↔E4. The A0–A3 naming is the build-plan design; E1–E6
is the Controller's deployment roster (adds E5 Launch Readiness + E6 Extraction).

| Agent | Also | Owns (sole writer) | Phase |
|---|---|---|---|
| **A0/E1 · Platform/Keystone** | E1 | `db/schema.ts`, `db/migrations/**`, `lib/db.ts`, `lib/intelligence/taxonomy.ts`, **`lib/intelligence/policy-evaluator.ts`** (types + `matchesCondition`), tenancy/RLS (`getTenantSql`, restricted role) | 0 |
| **A1/E2 · Intelligence/Backtest** | E2 | `lib/intelligence/policy-service.ts`, `lib/intelligence/reports.ts` | 1 (critical path) |
| **A2/E3 · Gateway** | E3 | ~~new `services/gateway/**`~~ (Fastify) → Next.js API route `/v1/precheck` (ADR 0004; imports `lib/intelligence` read-only) | 1 (parallel) |
| **A3/E4 · Policy UI/Attestation** | E4 | `app/(console)/policies/**` | 2 (trails A0) |
| **— / E5 · Launch Readiness** | E5 | `app/(console)/disputes/actions.ts`, `app/(console)/queue/actions.ts`, `app/(console)/rulebook/actions.ts`, new test files, count components | 0–1 (∥ E1) |
| **— / E6 · Extraction/Taxonomy** | E6 | new `lib/intelligence/extraction/**` | DEFERRED |

- **A0 owns the whole `policy-evaluator.ts`** (types + logic coupled: a new `PolicyCondition`
  key needs both a type change and a `matchesCondition` branch). A1 only *consumes* it.
  Seam: **evaluator = contract; policy-service = orchestration.**
- **Gateway lives in-repo at `services/gateway/`** — the evaluator is a live import, not a
  copied file, so a contract change can't silently drift. Split to its own repo only if
  deploy coupling hurts.
- **Frozen / do-not-touch (no agent writes):** `lib/audit/**`, `lib/ingestion/**`,
  `lib/disputes/**` — stable, out of scope for this wave. Prevents "helpful" refactors that
  cause conflicts.
- **Controller (founder) owns** `CLAUDE.md`, `docs/` index, all merges/integration — never
  writes domain code.

### D-Controller — How the solo founder runs the Controller role — LOCKED (recommendations)

The Controller is a **gate and a switchboard, not a coder.** A non-expert solo founder runs
this safely the same way the governance analyst does: **verify against oracles, don't judge
from expertise.** Highest-leverage practices:

1. **Review by contract + test + scope, not line-by-line.** For each agent PR, check four
   things you *can* judge without deep expertise: (a) tests pass; (b) it did what its doc
   said; (c) it did **not** touch files outside its ownership (D2); (d) it did **not** change
   the frozen contract. Any violation → stop, don't merge.
2. **Agents review agents; you adjudicate.** Use an independent reviewer agent (`/code-review`)
   on every PR before you look at it. You read the *review*, not the raw diff. This is the
   single biggest leverage for a non-expert Controller — you're never the only set of eyes.
3. **Lean on oracles, not opinions.** The **corrected backtest is the oracle** for A1 (run it,
   check the number is complete + an axis-crossing rule fires — `09` DP1); the **negative RLS
   test** is the oracle for A0 tenancy (`data-protection.md` D5); the **gateway negative test**
   for A2. If the oracle passes, you don't have to understand the implementation to trust it.
4. **Enforce the freeze ritual (the #1 Controller failure mode).** No fan-out (A1/A2/A3)
   starts until A0 tags the contract frozen (a `CONTRACTS.md` + a git tag). Starting parallel
   work on an unfrozen contract is what causes cascading rework. You hold this line.
5. **Cross-domain changes route through you (switchboard).** An agent that needs another's
   file files a **change request to the Controller**; you decide and route to the owning
   agent, who makes the change and re-freezes. No agent edits another's files. (Detailed in Q4.)
6. **Stagger, don't blast — match agents to your review capacity.** Solo cadence: Phase 0
   alone with A0 (full attention). Phase 1: A1 (critical, most attention) foregrounded; A2
   (greenfield, isolated, low merge risk) in the background. Don't run 4 streams you can't
   review.
7. **Merge in dependency order, small and often.** A0 first, then A1/A2, then A3; run the full
   test suite at each merge. Single-writer + non-overlapping dirs + separate branches makes
   merges near-conflict-free *by construction* — protect that property.
8. **The docs are your memory; the contracts are your dashboard.** You hold the dependency
   graph, the freeze state, and the merge order — not every line. Off-rails red flags a
   non-expert *can* see: out-of-ownership edits, a changed frozen contract, failing/deleted
   tests, a PR summary that doesn't match the doc, scope creep.

## Open branches

### D3 — Critical path: **revenue path first; gateway parallel-but-deprioritized** — LOCKED
- **Phase 0 (alone, blocking):** A0 freezes the keystone — new tables (`gateway_decisions`,
  `policy_taxonomy_candidates`, attestation columns), RLS restricted role, evaluator contract,
  taxonomy enums. Output: a tagged `CONTRACTS.md`. **Nothing else starts.**
- **Phase 1 (parallel, weighted):** **A1 backtest correctness = critical path, foreground**
  (unblocks the paid Ghost Audit, `09` DP1; oracle-validated). **A2 gateway scaffold =
  background** (needs only the frozen contract, touches zero existing files → isolated, low
  merge risk) but **trails in priority** (Phase-2 revenue).
- **Phase 2 (trailing):** A3 attestation UI (needs A0 schema + A1 reports), A2 gateway shadow
  mode.
- **Deferred (not this wave):** AI extractor + taxonomy-discovery promotion (depend on the
  unbuilt extractor; off the revenue path).
- **Non-obvious call:** the gateway is the exciting build but the *backtest fix is what lets
  you invoice* — don't let greenfield steal review bandwidth from the boring revenue fix.
### D4 — Contract-change protocol: **Change Request routed through Controller; two-tier freeze** — LOCKED
- **No agent writes outside its ownership, ever.** A downstream agent needing a contract
  change (e.g. A1 needs `temperatureMax?` on `PolicyCondition` + a `matchesCondition` branch)
  files a **Change Request to the Controller**, never edits the owner's file.
- **Controller triages and routes to the sole owner** (A0), who makes the change, updates
  `CONTRACTS.md`, re-tags, and notifies dependents. Switchboard = Controller; hands = owner.
- **Two-tier freeze:** *additive* (new optional field / enum value / table) = low-ceremony,
  version bump (`CONTRACTS.md` v1→v1.1) + notify; *breaking* (rename / type change / removal)
  = hard-freeze, Controller approval, all dependents re-validated (a mini Phase-0).
- **Batch changes** on a Controller-set cadence — don't re-freeze per request (dependents
  thrash). **Code + doc move together** (A0 owns its doc-sync; "code wins, doc follows").
- Same shape as `07` D4 (taxonomy promotion): requests are data flowing to the owner; the
  active contract changes only in the owner's hands via a deliberate transition.

### D5 — Context routing: **each agent reads its module doc + the frozen contract, nothing more** — LOCKED
The doc investment from eight sessions *is* the context-routing system — each agent gets a
minimal packet, never the whole repo.

| Agent | Reads (context only) |
|---|---|
| **A0** | `data-protection.md`, `03-taxonomy.md`, `06-schema.md`, `data-layer.md`, `CONTRACTS.md` (writes it) |
| **A1** | `04-backtest.md`, `adr/0001`, `09` (DP1/DP5), frozen `CONTRACTS.md`, `policy-evaluator.ts` (read) |
| **A2** | `08-gateway.md`, `data-protection.md` (Tier-2/RLS), `observability.md`, frozen `CONTRACTS.md`, `policy-evaluator.ts` (read) |
| **A3** | `09` (DG1 attestation, DP3), `01-ingestion.md` (trust/scope), `portal.md`, `policy-service.ts` interfaces (read) |

- **Never give an agent the full system context** — it wastes the window and invites
  out-of-scope edits. The module doc is the boundary of what the agent should know.
- `CONTRACTS.md` (A0's frozen output) is the *one* cross-cutting doc every code agent reads.

## Open branches

_(all resolved)_

## 1. Org Model

```text
                         ┌─────────────────────────────┐
                         │   CONTROLLER (the founder)  │
                         │  freezes contracts · routes │
                         │  change requests · merges   │
                         │  reviews via oracles + CR   │
                         └──────────────┬──────────────┘
                                        │ Phase 0 (blocking)
                         ┌──────────────▼──────────────┐
                         │   A0 · PLATFORM / KEYSTONE   │
                         │  schema · migrations · RLS   │
                         │  evaluator contract · enums  │
                         │  → freezes CONTRACTS.md      │
                         └───┬───────────┬───────────┬──┘
              Phase 1 (fg)   │  Phase 1  │  Phase 2  │
              critical path  │  (bg)     │  trails   │
            ┌────────────────▼┐ ┌────────▼────────┐ ┌▼──────────────────┐
            │ A1 · INTELLIGENCE│ │ A2 · GATEWAY    │ │ A3 · POLICY UI /  │
            │   /BACKTEST      │ │ /v1/precheck   │ │   ATTESTATION     │
            │ fix loadBacktest │ │ (Next.js route) │ │ app/(console)/    │
            │ Contexts (rev    │ │ imports         │ │ policies/**       │
            │ gate, DP1)       │ │ evaluator R/O   │ │ DG1 attest flow   │
            └──────────────────┘ └─────────────────┘ └───────────────────┘
       FROZEN / DO-NOT-TOUCH: lib/audit/** · lib/ingestion/** · lib/disputes/**
```

## 2. Core Invariants (no agent may violate)

1. **Single-writer-per-file.** No agent writes outside its D2 ownership; cross-domain needs
   go through a Controller-routed Change Request (D4).
2. **Detection is deterministic.** No LLM/RAG in the evaluator or backtest path (ADR 0003);
   the backtest must be reproducible and complete — **keyset pagination, never `LIMIT`
   truncation** in financial/backtest reads (CLAUDE.md inv. 1; fixes the DP1 bug).
3. **Tenant isolation is non-negotiable.** All Tier-2 reads go through the restricted role +
   RLS; `clientId` comes from auth/API-key, **never** the request body (`data-protection.md`).
4. **The evaluator contract is frozen.** `ShipmentPolicyContext` / `PolicyCondition` /
   `PolicyDecision` change only via A0 on a Controller-routed CR (D4).
5. **AI is suggest-only; nothing auto-activates.** A rule reaches `active` only via human +
   client attestation (CLAUDE.md inv. 4/10; `09` DG1). The gateway ships shadow-first
   (`08-gateway.md` D2).

## 3. Routing & Delegation Matrix

| Agent | Owns (Docs) | Owns (Code — sole writer) | Reads (context only) |
|---|---|---|---|
| **A0 Keystone** | `CONTRACTS.md` (authors), `data-layer.md` | `db/schema.ts`, `db/migrations/**`, `lib/db.ts`, `lib/intelligence/taxonomy.ts`, `lib/intelligence/policy-evaluator.ts`, RLS role | `data-protection.md`, `03-taxonomy.md`, `06-schema.md` |
| **A1 Intelligence** | `04-backtest.md` | `lib/intelligence/policy-service.ts`, `lib/intelligence/reports.ts` | `adr/0001`, `09` (DP1/DP5), `CONTRACTS.md`, `policy-evaluator.ts` (R) |
| **A2 Gateway** | `08-gateway.md` | `services/gateway/**` | `data-protection.md`, `observability.md`, `CONTRACTS.md`, `policy-evaluator.ts` (R) |
| **A3 UI/Attestation** | `09` (DG1/DP3 parts) | `app/(console)/policies/**` | `01-ingestion.md`, `portal.md`, `policy-service.ts` ifaces (R) |

## 4. Parallelization Track

```text
PHASE 0  [blocking, Controller + A0 only]
  A0: new tables (gateway_decisions, policy_taxonomy_candidates, attestation cols),
      RLS restricted role + getTenantSql, freeze evaluator contract + enums.
  → tag CONTRACTS.md v1. NO fan-out until this tag exists.

PHASE 1  [parallel, weighted]
  A1 (FOREGROUND, critical path): fix loadBacktestContexts — shipment spine, keyset
      pagination, dedup, tri-valued, ship-date ruleset. Oracle: re-run stable + complete
      + axis-crossing jewelry rule fires. → unblocks paid Ghost Audit (revenue).
  A2 (BACKGROUND, parallel): Next.js API route `/v1/precheck` calling `evaluatePolicyContext()` in `mode:'pre_shipment'`
      cache, API keys). Isolated — touches no existing file. Phase-2 revenue → trails.

PHASE 2  [trailing]
  A3: attestation flow (draft→client_attested→active) + scope-statement UI.
  A2: shadow-mode enforcement + gateway_decisions durable log.

DEFERRED (not this wave): AI extractor, taxonomy-discovery promotion.
```

## 5. Phase-0 Keystone bootstrap prompt (copy-paste)

```text
You are A0, the PLATFORM / KEYSTONE agent for the Aurelian freight-governance platform.
You are the SOLE WRITER of: db/schema.ts, db/migrations/**, lib/db.ts,
lib/intelligence/taxonomy.ts, lib/intelligence/policy-evaluator.ts, and the tenancy/RLS
layer. You write NO other files. Do not touch lib/audit/**, lib/ingestion/**,
lib/disputes/**, app/**, or services/** — those are owned by other agents and are frozen
to you.

CONTEXT (read only these): docs/data-protection.md, docs/policy-intelligence/03-taxonomy.md,
docs/policy-intelligence/06-schema.md, docs/data-layer.md. Do not request the rest of the
repo.

YOUR PHASE-0 MISSION — build and FREEZE the shared contract every other agent depends on:
1. Add migrations + db/schema.ts entries for: gateway_decisions (Tier-2), 
   policy_taxonomy_candidates (Tier-0), and ruleset attestation columns 
   (status: draft|client_attested|active + attested_by/at). Follow the data-layer.md 
   migration pattern; index client_id + common filters; do not backfill destructively.
2. Tenancy: create a restricted app_tenant Postgres role and a getTenantSql(clientId) 
   pooled helper that SETs app.current_tenant; add RLS policies (array-membership for the 
   text[] tenancy tables, scalar for client_id) with FORCE ROW LEVEL SECURITY. Comparisons 
   are text, never ::uuid.
3. Confirm/extend the evaluator contract types (ShipmentPolicyContext, PolicyCondition, 
   PolicyDecision) in policy-evaluator.ts and the taxonomy.ts enums. Do NOT add new 
   PolicyCondition keys unless a Change Request asks; just stabilize what exists.
4. Write docs/CONTRACTS.md documenting the frozen schema + evaluator types + enums, and 
   stop. Output a summary + the proposed git tag (contracts-v1).

HARD RULES: deterministic only (no LLM in evaluator); keyset-pagination friendly; clientId 
never from request body; everything that can fail financially must fail visibly. Write 
tests for the RLS negative case (no tenant set → 0 rows) and hand back. Do not start 
dependent work; the Controller fans out AFTER you tag contracts-v1.
```

## Full engineer roster (PM work breakdown — all open work)

Single Controller (founder). Single-writer-per-file. Parallel **only** where file ownership
is disjoint AND there is no dependency — each such case is marked "∥ deemed-OK" with the
reason. Covers everything still open: launch blockers, policy-intelligence MVP gaps, backtest
correctness, governance, gateway, taxonomy discovery.

> Already shipped (do NOT reassign): structured logging + correlation IDs, `/api/health`,
> `withObservability`, Sentry config (`observability.md`); the policies console routes,
> `runPolicyBacktest`/`reports` (exist but **incorrect** — that's E2), the evaluator.

### Roster

| Eng | Mission | Phase | Parallel? |
|-----|---------|-------|-----------|
| **C — Controller** | Freeze contracts, route Change Requests, review-via-oracle, merge in dep order | all | — |
| **E1 — Keystone/Platform** | Schema + migrations + tenancy/RLS + freeze the contract | 0 (blocking) | — |
| **E2 — Intelligence/Backtest** | Fix backtest correctness (the revenue gate) | 1 (foreground) | ∥ E3 deemed-OK |
| **E3 — Gateway** | ~~New Fastify precheck service~~ Next.js API route `/v1/precheck` calling `evaluatePolicyContext()` in `mode:'pre_shipment'` (ADR 0004) | 1 (background) | ∥ E2 deemed-OK |
| **E4 — Policy UI & Attestation** | Attestation flow + scope statement + MVP UI gaps | 2 (trailing) | — (needs E1+E2) |
| **E5 — Launch Readiness & Hardening** | Server-action validation + tests + UI counts | 0–1 | ∥ E1 deemed-OK |
| **E6 — Extraction & Taxonomy Discovery** | AI extractor + taxonomy candidates | DEFERRED | — |

### E1 — Keystone / Platform  *(Phase 0, blocking — no fan-out until `contracts-v1`)*
**Owns code:** `db/schema.ts`, `db/migrations/**`, `lib/db.ts`, `lib/intelligence/taxonomy.ts`,
`lib/intelligence/policy-evaluator.ts`, RLS role. **Owns docs:** `CONTRACTS.md`, `data-layer.md`.
**Reads:** `data-protection.md`, `03-taxonomy.md`, `06-schema.md`.
**Tasks:** (1) migrations + schema for `gateway_decisions` (Tier-2), `policy_taxonomy_candidates`
(Tier-0), ruleset attestation columns (`draft|client_attested|active` + `attested_by/at`);
(2) restricted `app_tenant` role + `getTenantSql(clientId)`; RLS policies (array-membership for
`text[]` tenancy, scalar for `client_id`) + `FORCE ROW LEVEL SECURITY`; text comparisons only;
(3) `CHECK(cardinality=1)` on the array tenancy tables (data-protection D4); (4) stabilize +
freeze evaluator types & enums; author `CONTRACTS.md`, tag `contracts-v1`; (5) RLS negative test
(no tenant → 0 rows).

### E2 — Intelligence / Backtest  *(Phase 1, FOREGROUND / critical path — revenue gate, `09` DP1)*
**Owns code:** `lib/intelligence/policy-service.ts`, `lib/intelligence/reports.ts`.
**Owns docs:** `04-backtest.md`. **Reads:** `adr/0001`, `09` (DP1/DP5), `CONTRACTS.md`,
`policy-evaluator.ts` (R).
**Tasks (BACKLOG "Backtest Correctness ADR 0001"):** (1) rebuild `loadBacktestContexts` around the
shipment spine; (2) replace `LIMIT 5000` with keyset pagination; (3) dedup preventable loss by
`audit_result_id`; (4) multi-shipment invoices → `DATA_REQUIRED`, not `invoice[0]`; (5) tri-valued
eval (pass/fail/unknown → 3-bucket Ghost Audit, `09` DP5); (6) effective-dated ruleset selection by
`"Ship date"`. **Oracle:** re-run = stable + complete; an axis-crossing jewelry rule fires.

### E3 — Gateway  *(Phase 1 background → Phase 2 enforcement)*
**Owns code:** ~~new `services/gateway/**`~~ → Next.js API route `app/api/v1/precheck/route.ts` (ADR 0004). **Owns docs:** `08-gateway.md`. **Reads:**
`data-protection.md`, `observability.md`, `CONTRACTS.md`, `policy-evaluator.ts` (R).
**Tasks (BACKLOG "Aurelian Gateway V1"):** ~~Fastify~~ Next.js API route `/v1/precheck` (Zod = `ShipmentPolicyContext`) +
WMS adapter + generic fallback; warm versioned snapshot cache (effective-dated, TTL invalidation);
always-200 contract (`decision/enforced/approval_token/violations/rulesetVersion/correlationId`);
per-client+per-rule mode (shadow→approval→block); risk-tiered failure (fail-open default,
fail-closed above `declaredValue` threshold); `gateway_decisions` at-least-once durable log +
per-client API keys (tenant identity from key, never body); observability plugin port.

### E4 — Policy UI & Attestation  *(Phase 2, trails E1+E2)*
**Owns code:** `app/(console)/policies/**`. **Owns docs:** `09` (DG1/DP3 parts). **Reads:**
`01-ingestion.md`, `portal.md`, `policy-service.ts` ifaces (R).
**Tasks:** attestation transition `draft→client_attested→active` (client *confirm/reject*, not
author, on their own policy, reviewed clause-by-clause); per-client written **scope statement**
generated from the ruleset; rule-editor / ruleset-versioning MVP polish (BACKLOG "Policy
Intelligence MVP"); guarantee+disclaimer + 3PL-SLA clause artifacts (DG3/DG4) as templates.

### E5 — Launch Readiness & Hardening  *(Phase 0–1, ∥ E1 deemed-OK: disjoint files, no contract dep)*
**Owns code:** `app/(console)/disputes/actions.ts`, `app/(console)/queue/actions.ts`,
`app/(console)/rulebook/actions.ts`, new test files under `lib/**/__tests__`, bounded view
components for counts. **Reads:** `auth.md`, `audit-engine.md`, relevant module docs.
**Tasks (LAUNCH-BLOCKERS, live items only):** (1) Zod validation on the three server-action files;
(2) test coverage — audit rules, `3pl-rules`, rulebook resolver, ingestion normalization, API
routes; (3) UI table count coverage ("showing X of Y") on bounded tables.
**Note:** observability launch blockers are DONE — not in scope.

### E6 — Extraction & Taxonomy Discovery  *(DEFERRED — depends on the unbuilt extractor; off revenue path)*
**Owns code:** new `lib/intelligence/extraction/**` (NOT `policy-service.ts` — that's E2).
**Owns docs:** `02-extraction.md`, `07-schema-evolution.md`. **Reads:** `CONTRACTS.md`, `03-taxonomy.md`.
**Tasks:** `policy_extract` job (suggest-only, tripwires, grounding); populate
`policy_taxonomy_candidates` + dedupe/seen_count; `taxonomy_admin` capability + review UI; close the
temperature capture/enforce gap (**via Change Request to E1** to add the `PolicyCondition` key).

### Parallelism map ("no parallels unless deemed okay")

```text
WAVE A (Phase 0)   E1 Keystone  [blocking]   ∥  E5 Launch-Readiness  [deemed-OK: existing
                                                  console/test files, no contract dependency]
        └── gate: E1 tags contracts-v1 ──┐
WAVE B (Phase 1)   E2 Backtest [fg, critical]  ∥  E3 Gateway [bg]   [deemed-OK: policy-service/
                                                  reports vs services/gateway are disjoint;
                                                  both only READ the frozen contract]
                   E5 continues
WAVE C (Phase 2)   E4 Policy UI/Attestation  [sequential — needs E1 schema + E2 reports]
                   E3 gateway shadow mode continues
DEFERRED           E6 Extraction & Taxonomy Discovery
```

## Status

Planning only — no code written. Phase 0 (E1) is the first build step; all fan-out waits on
`contracts-v1`. The revenue-critical thread is **E1 → E2 → paid Ghost Audit**.

## Related

- `docs/policy-intelligence/09-analyst-decision-support.md` (DP1: backtest fix is the
  revenue gate), `docs/data-protection.md`, `docs/policy-intelligence/08-gateway.md`,
  `docs/BACKLOG.md` (the work items), `docs/CLAUDE.md` (invariants).
