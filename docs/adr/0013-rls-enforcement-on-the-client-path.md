# ADR 0013 — RLS Enforcement on the Client Path (Finishing the D2 Design)

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session — post-launch-blocker review)
- **Related**: [`data-protection.md`](../data-protection.md) D2/D5, ADR 0006 (scalar `client_id`), `db/migrations/0006_keystone_contract.sql`, [`LAUNCH-BLOCKERS.md`](../LAUNCH-BLOCKERS.md) Tenant Isolation

## Context

The E1 Keystone wave shipped a restricted `app_tenant` Postgres role, `getTenantSql(clientId)`, RLS policies, and `FORCE ROW LEVEL SECURITY` on 9 Tier-2 tables (migration 0006). A launch-blocker review found the enforcement is **not load-bearing**:

- `getTenantSql` has **zero callers** — every read, including client-scoped portal reads, connects as the owner `neondb_owner` via `getSql()`, which bypasses RLS. Runtime tenant isolation rests entirely on app-layer `WHERE client_id` clauses.
- The "negative isolation test" ([`lib/__tests__/rls-isolation.test.ts`](../../lib/__tests__/rls-isolation.test.ts)) is **parse-only** — it regex-matches the migration SQL and never opens a connection, so it cannot prove isolation or catch the unused enforcement path.
- `FORCE ROW LEVEL SECURITY` sits in a "shipped" migration. Applied against the current owner-connection strategy it either silently no-ops (owner has `BYPASSRLS`) or default-denies every core table into an app-wide outage.

[`data-protection.md`](../data-protection.md) D2 already specified the intended shape — `getTenantSql` for Tier-2 client-scoped reads, `getSql()` for staff/aggregate/BI. This ADR records the decision to **finish** that design rather than abandon or over-extend it.

## Decision 1 — Enforce RLS on the client path; keep staff/engine/BI on the owner

Client-scoped reads (the entire client portal) route through `getTenantSql(session.user.clientId)`, so RLS enforces tenancy at the database engine. The staff console, the audit engines, and cross-tenant BI/reports legitimately read across tenants and continue to use the owner `getSql()`. The portal is the real cross-tenant exposure surface (clients authenticate and query their own data); the console is staff-only and cross-tenant by design.

## Decision 2 — Thread the tenant connection through one optional parameter

The `records.ts` read helpers (`fetchRecords`, `fetchRecord`, `fetchAllRecords`, and the id/link resolvers) gain an optional trailing `db` argument defaulting to `getSql()`. The portal data-loader acquires one `getTenantSql(clientId)` per request, passes it to every read, and `release()`s it in a `finally`. The Neon HTTP driver and the pooled `PoolClient` share a `.query(text, params)` signature, so this reuses the single data layer (formula translator + soft-delete gating) without forking it.

Rejected: AsyncLocalStorage request-context (implicit magic + edge caveats); a parallel tenant-records module (forks the just-consolidated data layer).

## Decision 3 — Extend the restricted role to exactly the portal read-set

Migration 0006 granted `app_tenant` and wrote policies for only 9 tables; the portal also reads `Clients`, `policy_rulesets`, `policy_attestations`, and (T4) `policy_scope_exclusions`. A forward migration grants `SELECT` and adds RLS policies for precisely those tables — least privilege, no broad grant.

`Clients` is the **own-row** case: its tenancy key is `id`, not `client_id`, so its policy is `USING (id = current_setting('app.current_tenant', true))`. The others use the standard `client_id = current_setting(...)` form.

Rejected: partial RLS with owner reads for the "odd" tables (the client's own identity reads would bypass RLS — inconsistent); broad grant on all tables (larger blast radius, every table needs its correct tenancy-key policy up front).

## Decision 4 — Behavioral isolation test, gated on a real database

Replace the parse-only test's role as the *isolation* proof with an integration test that connects as `app_tenant`, asserts 0 rows with no `app.current_tenant` set, then seeds tenant A/B and asserts A cannot read B. It is gated on `TEST_DATABASE_URL` (a Neon branch) — runs in CI where set, skips locally where unset. The parse-only test is retained as a fast static lint of policy presence.

## Decision 5 — Rollout sequencing defuses the FORCE-RLS landmine

The grants, new policies, and `FORCE ROW LEVEL SECURITY` (re-)assertion ship in a **new** forward migration (`0014_rls_rollout.sql`) — migration 0006 is never edited in place once applied anywhere. The rollout migration is applied **only after** the portal `getTenantSql` wiring is deployed, so FORCE RLS never engages before a client-path connection that sets `app.current_tenant` exists. Until then the launch-blocker claim reads "policies authored, enforcement pending," not "done."

## Consequences

- The client portal gains a real database-engine isolation failsafe; a missing or wrong app-layer `WHERE client_id` no longer leaks across tenants.
- Adding a new portal read of an ungranted table now fails loudly (permission denied) and is caught by the behavioral test — the previous silent-bypass failure mode is gone.
- Per-request connection acquire/release adds minor portal latency and requires disciplined `finally` release to avoid pool exhaustion.
- Staff console / audit engine behavior is unchanged (owner connection).
- The launch-blocker "Negative isolation test in CI" item is genuinely closeable only when the behavioral test runs against a migrated branch DB.
