# Build Plan v2 — Launch Hardening (Multi-Agent Execution)

> **STATUS: PLANNING (2026-06-27).** Sequences the open work from the review/grilling backlog
> ([`LAUNCH-BLOCKERS.md`](LAUNCH-BLOCKERS.md), [`BACKLOG.md`](BACKLOG.md), ADRs 0013–0016) into
> one Controller + 6 engineers. Same discipline as [`BUILD-PLAN.md`](BUILD-PLAN.md) (single-writer,
> keystone-first, doc-scoped context): the original build plan is EXECUTED; this is the next wave.

## Framing

The work is a **critical path with side branches**, not a balanced fan-out. One track (the
migration toolchain) **gates everything** — no migration-writing track can safely proceed until a
fresh database can be provisioned correctly and migration numbers are centrally allocated. Parallel
is allowed only where file surfaces are disjoint **and** the two shared surfaces (migration numbers,
`db/schema.ts`) are centrally managed.

## Keystone (Wave 0, frozen before fan-out)

The keystone is **not a new data layer** — it is the **migration toolchain + the migration-number
registry + the `db/schema.ts` source-of-truth decision**. Every downstream track writes migrations
and/or schema columns; until provisioning works and numbers are allocated, fan-out collides.

## Ownership Map — 6 engineers, non-overlapping write surfaces

| Engineer | Owns (sole writer) | Wave |
|---|---|---|
| **E1 · Platform / Migration Toolchain** (keystone) | `db/migrations/meta/**`, `drizzle.config.ts`, `package.json` *scripts* section, the migrate runner; re-baselines `db/schema.ts` then hands it to the Controller; publishes the **migration-number registry** | 0 (solo, blocking) |
| **E2 · Auth & Route Protection** | `auth.config.ts`, `middleware.ts`, `app/api/v1/precheck/route.ts`, `lib/gateway/precheck.ts` | 1 → 2 |
| **E3 · Data Access Layer & Tenant Isolation** | `lib/db.ts`, `lib/db/records.ts`, `lib/portal/data-loader.ts`, the RLS-rollout migration, `lib/__tests__/rls-isolation.test.ts` | 2 |
| **E4 · Schema Integrity & Modeling** | schema-integrity migrations, `lib/portal/attestation.ts` | 2 (∥ E3) |
| **E5 · Policy Intelligence Pipeline** | `lib/intelligence/{embeddings,pipeline,classifier,policy-service}.ts`, `app/(portal)/portal/policy-review/actions.ts`, `components/console/t3-feedback-panel.tsx`, pipeline migrations | 2 (∥ E3/E4) |
| **E6 · Build, CI & Stack Hardening** | `.github/workflows/**`, `package.json` *engines/deps*, `next.config.mjs`, new `lib/llm/**`, `services/gateway/**` (shelve) | 1 (∥ E2) |

**Frozen / do-not-touch (no engineer writes):** `lib/audit/**`, `lib/ingestion/**`,
`lib/disputes/**` — stable, out of scope; prevents conflict-causing "helpful" refactors.

**Controller (C0)** — gate + switchboard, never writes domain code. Sole writer of `db/schema.ts`
(after E1's re-baseline), the **migration-number registry**, `CLAUDE.md`, the `docs/` index,
`LAUNCH-BLOCKERS.md` / `BACKLOG.md` checkbox flips. Arbitrates `package.json` (E1 scripts vs E6
deps). Runs `/code-review` on every PR; merges; verifies each PR touched only its owned files.

---

## E1 · Platform / Migration Toolchain — KEYSTONE (Wave 0, solo, blocking)

**Description.** Make one command provision a complete, correct database, and unblock every
migration-writing track. This is the runtime face of schema-review G3 and launch-blocker L1.

**Tasks**
- Resolve the source of truth (G3): either re-baseline Drizzle from the live DB (regenerate journal/snapshots so `db:migrate` knows `0000`–`0014`) **or** adopt a raw-SQL runner that applies migrations in order and tracks them. Pick one; `schema.ts` stays a typed read-model.
- Fix L1: `npm run db:migrate` (or the chosen command) provisions an empty Neon branch to all 36 tables + RLS policies + grants + constraints; verify on a fresh branch.
- Stand up a `TEST_DATABASE_URL` Neon branch + a documented "provision from zero" path (hand wiring to E6).
- Publish the **migration-number registry** (next free numbers for E3/E4/E5).
- Re-baseline `db/schema.ts`, then hand single-writer authority to the Controller.

**Docs (writes):** `docs/data-layer.md` (toolchain + source-of-truth), `CLAUDE.md` (drop/qualify the "schema.ts is authoritative" claim).
**Gate:** `db-foundation-ready` + registry published. Nothing in Wave 2 starts before this.

## E2 · Auth & Route Protection (Wave 1 → 2)

**Description.** Close the two route-protection holes; bring the launch gateway to its ADR-0016 contract.

**Tasks**
- **(Wave 1, launch blocker)** Fix the `authorized`-callback ordering bug ([`auth.config.ts:43`](../auth.config.ts)): allow `/api` + marketing routes before the `!isLoggedIn` gate. Unblocks ingestion, both Vercel crons, `/api/health`, and the public marketing site.
- **(Wave 2, after E3 ships `getTenantSql`)** Port per-client-key gateway auth (ADR 0016 D1): `GATEWAY_API_KEY_<clientId> → clientId`, ignore body `clientId`. Convert `gateway_decisions` to a synchronous in-txn write as `app_tenant` (ADR 0016 D2); per-request effective-dated read (D3).

**Docs (writes):** `docs/auth.md` (route table, gateway auth model).

## E3 · Data Access Layer & Tenant Isolation (Wave 2)

**Description.** Make RLS load-bearing on the client path (ADR 0013) and fix the soft-delete data layer.

**Tasks**
- Optional `db` param on the `records.ts` read helpers; portal data-loader acquires/releases one `getTenantSql(clientId)` per request.
- RLS-rollout migration (number from registry): extend grants + policies to the portal read-set (`Clients` own-row, `policy_rulesets`, `policy_attestations`, `policy_scope_exclusions`) and the analytics tables (G4); `FORCE RLS` applied only after wiring lands.
- Behavioral isolation test gated on `TEST_DATABASE_URL`; retire the parse-only test as the isolation proof.
- Soft-delete: gate `deleted_at IS NULL` on a `SOFT_DELETE_TABLES` set (fixes the `Carrier Codes` crash); apply the same gate to id/link resolvers.

**Docs (writes):** `docs/data-protection.md`.
**Depends:** E1 gate. **Hands to E2** (`getTenantSql` ready) and **E6** (behavioral test for CI).

## E4 · Schema Integrity & Modeling (Wave 2, ∥ E3 — deemed OK)

**Description.** Add the integrity the schema lacks; resolve the cheap overlaps now, schedule the rest.

**Tasks**
- G1 — FK migration on intra-Postgres relationships (`policy_rules.ruleset_id`, `policy_backtest_results.*`, `gateway_behavioral_tags.audit_result_id`, …) with `ON DELETE` policy.
- G5 — CHECK constraints / enums on status/type/source columns (`policy_scope_exclusions.status`/`exclusion_type`, `signal_source`).
- G2 + O4 — create `policy_attestations` (or rewrite the panel to derive from `policy_rulesets.status='client_attested'`); pick one attestation authority.
- O5 — document backtest-dollar duplication as a snapshot. **(O1/O2/O3 convergence → Wave 3.)**

**Docs (writes):** `docs/policy-intelligence/06-schema.md`.
**Depends:** E1 gate + registry. Requests `schema.ts` column changes via the Controller.

## E5 · Policy Intelligence Pipeline (Wave 2, ∥ E3/E4 — deemed OK)

**Description.** Fix the 4-tier pipeline review findings and land the client-defined-rule governance (ADR 0014/0015).

**Tasks**
- Pipeline: drop the `deleted_at` filter on `clause_embeddings` (T3→T1 panel crash); increment `match_count` on vector hit; keep T3 near-matches non-`mapped`; `clause_hash` unique index (btree→hash, migration from registry); batch/parallelize embeddings.
- `defineClauseAction` (ADR 0014): `findOrCreateNextDraft(clientId)` + copy-forward; replace the `ruleset_id = NULL` insert; make the action atomic.
- `staff_reviewed` gate (ADR 0015): column (migration from registry) + exclude unreviewed `CLIENT_DEFINED` rules from the attestable/activatable set.
- `excluded_by` = `session.user.id`; reconcile T4 status vocabulary + dedup.

**Docs (writes):** `docs/policy-intelligence/02-extraction.md`.
**Depends:** E1 gate + Controller-coordinated `schema.ts` additions (`staff_reviewed`, `clause_hash`).

## E6 · Build, CI & Stack Hardening (Wave 1, ∥ E2 — deemed OK)

**Description.** Add the missing safety net and stack hygiene.

**Tasks**
- SG1 — CI: `npm ci --legacy-peer-deps` → typecheck → test on every PR; wire E3's behavioral RLS test against the `TEST_DATABASE_URL` branch.
- SG2 — pin Next.js off canary; drop `experimental.instrumentationHook`. SG3 — `engines.node` in both manifests.
- SO2 — shared `lib/llm/` client (timeout/retry/single key source) for OpenAI/DeepSeek/Anthropic.
- ADR 0016 — mark `services/gateway/**` not-launch-scoped; ensure CI/deploy never builds it as a launch artifact.

**Docs (writes):** `docs/observability.md` (CI/health), `docs/BACKLOG.md` SG/SO flips (via Controller).
**Depends:** E1 (migrate path in CI) + E3 (behavioral test) — CI scaffold + pins start in Wave 1; RLS-test wiring lands after E3.

---

## Wave Schedule & Parallel Justification

```
WAVE 0 (solo, blocking):   E1 Keystone
        ── gate: db-foundation-ready + migration-number registry ──
WAVE 1 (∥ deemed OK):      E2 (middleware fix)   ∥   E6 (CI scaffold + version pins)
        → deemed OK: auth.config/middleware (E2) vs .github/package.json-deps/next.config (E6)
          share zero files; neither writes migrations.
WAVE 2 (∥ deemed OK):      E3 (lib/db*)  ∥  E4 (migrations+attestation)  ∥  E5 (lib/intelligence)
                           + E2 gateway-auth (joins after E3's getTenantSql)
        → deemed OK: CODE files are disjoint. The only two shared surfaces —
          migration NUMBERS and db/schema.ts — are centrally managed (Controller registry +
          Controller single-writer), so there are no write collisions.
WAVE 3 (sequential, post-launch):  E4 overlap convergence O1/O2/O3 (insurance→policy_rules,
                           client_insurance_policies extension, gateway-tag authority) — not launch-blocking.
```

**Parallel-safety rules (the "deemed OK" justification):**
1. **Migrations** — numbers pre-allocated by the Controller registry; one engineer per number.
2. **`db/schema.ts`** — Controller is sole writer; engineers submit column-change requests.
3. **`package.json`** — E1 owns `scripts`; E6 owns `engines`/deps; Controller arbitrates.
4. **Frozen dirs** — `lib/audit/**`, `lib/ingestion/**`, `lib/disputes/**`: no writes.

**Launch gate (blockers cleared):** E1 (provisioning) + E2 (middleware) + E3 (RLS + Carrier Codes) +
E5 (`defineClauseAction`) + E6 (CI) all merged and green. E4 integrity + E2 gateway-auth land in the
same wave; O1–O3 convergence is post-launch.
