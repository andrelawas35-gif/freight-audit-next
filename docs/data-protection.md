# Data Protection & Tenant Isolation

> **STATUS: PLANNING (2026-06-26).** This is a live design record being built via a
> grilling session. Nothing here is implemented yet. Decisions marked **LOCKED** are
> settled; **OPEN** branches are still being resolved. When a decision ships, move its
> status note to `docs/CHANGELOG.md` and the open work to `docs/BACKLOG.md` /
> `docs/LAUNCH-BLOCKERS.md` per the usual discipline — do not let this doc become a
> duplicate status checklist.

## What this is

How Aurelian Collective keeps each client's freight, carrier-rate, claims, and policy
data logically isolated **while** still allowing cross-tenant business intelligence
(benchmarks, learned mappings, gateway signal aggregates) to be produced without leaking
one tenant's values into another's namespace.

Two requirements in tension:

```text
ISOLATION (protect the values)            BI / LEARNING (share the patterns)
client_id-scoped rows, RLS failsafe   <-> aggregates, benchmarks, learned_mappings
"Client A cannot see Client B"            "the platform gets smarter across clients"
```

The whole design is about drawing the boundary between these two precisely, and making
the isolation half enforceable by the database engine — not just by remembering to write
`WHERE client_id = ?`.

## Current reality (grounding)

- **Model today is Pooled.** Every business/platform table carries `client_id text`
  (see `db/schema.ts`); portal queries scope in-app via `session.user.clientId`
  (`auth.config.ts:72`). This is invariant #6 in `CLAUDE.md` (client scoping).
- **Driver is the stateless Neon HTTP driver** (`lib/db.ts`, `neon(DATABASE_URL)`).
  Each `` sql`...` `` is an independent HTTP request with **no persistent session**.
- **Tenant key is `text`, not `uuid`** — and on `"Invoices"` it is a *text array*
  (`"Clients" text[]`, `db/schema.ts:53`): a row can belong to multiple clients. Any
  isolation policy must handle array membership, not scalar equality. (See OPEN-Q4.)
- **Transactions today are issued as separate `sql.query('BEGIN')` calls**
  (`engine.ts:117`, `policy-service.ts:377`, `stage.ts:40`). On the HTTP driver these
  are not guaranteed to share a backend connection — a latent concern for both atomicity
  (CLAUDE.md invariant #3) and for any `SET`-based session state. See "Driver mechanics".

## Threat model

The control is scoped to the threats we actually face, ranked:

| Threat | Description | Primary mitigation |
|--------|-------------|--------------------|
| **(a) Developer bug** *(primary)* | A forgotten `WHERE client_id = ?` in a JOIN/query leaks rows across tenants. | RLS failsafe at the DB engine. |
| **(c) Compliance evidence** *(business driver)* | A CISO / SOC2 auditor needs a documented, demonstrable isolation control. | RLS policy + restricted role = a real, auditable control. |
| (b) Compromised app credential | Attacker obtains `DATABASE_URL` / running server. | Reduced (not eliminated) by non-owner role; out of full scope. |
| (d) Physical separation / residency | A contract demands a dedicated instance. | **Not in scope** — no signed contract requires it. Revisit per-deal. |

We are **not** migrating to schema-per-tenant or siloed instances. Those primarily buy
(d), which we do not have, at the cost of rewriting 25+ tables' access patterns and
fighting the cross-tenant BI feature.

## Decisions

### D1 — Isolation model: **Pooled + RLS failsafe** — LOCKED
Keep the single-schema, `client_id`-per-row model. Add PostgreSQL Row-Level Security as
defense-in-depth so a forgotten `WHERE` is caught by the engine, not shipped to a client.
RLS doubles as the documentable control for compliance threat (c).

**Rejected:** Schema-per-tenant ("Hybrid Bridge"). It targets threat (d) we don't have,
breaks the existing `client_id` convention across 25+ tables, multiplies migration and
Neon-branching burden by N tenants, and obstructs cross-tenant BI.

### D2 — Enforcement mechanism: **pooled restricted-role connection** — LOCKED
RLS can only work if (1) the tenant identity is visible to the DB at query time and
(2) the app connects as a role that RLS actually applies to.

- **Driver:** introduce a second connection path — a **pooled wire connection**
  (`Pool` / `pg`-style) for RLS-protected reads, alongside the existing HTTP `getSql()`
  for non-sensitive/aggregate work. A pooled connection is stable for the life of a
  checkout, so `SET app.current_tenant` persists across the subsequent `SELECT`. The
  HTTP driver cannot do this reliably (no session continuity).
- **Restricted role:** the app must connect as a **non-owner Postgres role**. RLS is
  **bypassed for the table owner and superusers by default** — if the app keeps using the
  owner/admin role, every policy is silently skipped and the CISO story is false. A
  restricted `app_tenant` role (with `FORCE ROW LEVEL SECURITY` on protected tables as
  belt-and-suspenders) is non-negotiable for the control to be real.
  - **CONFIRMED (DB check 2026-06-26):** the app currently connects as `neondb_owner`,
    which is the **table owner** (`is_superuser = false`, but owner still bypasses RLS).
    So as-is, enabling RLS would do **nothing** to this connection. Phase 1 therefore
    *must* either (preferred) introduce a restricted `app_tenant` role for protected
    reads, or at minimum apply `ALTER TABLE ... FORCE ROW LEVEL SECURITY` so the owner is
    also subject to policies. Recommendation: do both.
- **Helper shape:** `getTenantSql(clientId)` checks out a pooled connection as the
  restricted role and sets `app.current_tenant` for that checkout; `getSql()` (HTTP)
  stays for console aggregates / BI that legitimately reads across tenants.

**Rejected alternative:** `SET LOCAL` bundled into Neon's `transaction([...])` array API.
Works with the HTTP driver but forces every protected read to become a transaction and
can't interleave JS between statements. Kept as a fallback if the pooled driver proves
operationally heavy on Neon serverless.

### D3 — BI boundary: **3-tier classification + k-anonymity, staff-internal at launch** — LOCKED
The leak a CISO actually probes is not "Client A queries Client B's table" — RLS handles
that — but "Client A infers Client B's rates from a benchmark." A benchmark like
"avg accessorial overcharge for refrigerated LTL on carrier X in zip 900xx" **is** one
client's contract rate if only one client ships that lane. So every cross-tenant surface
is classified, and aggregates are gated by a cohort floor.

**Data classification — the tier, not the table name, decides which connection may read it:**

| Tier | What | Examples | Access |
|------|------|----------|--------|
| **0 — Structural/abstract** | The *shape* of the world; never a tenant's number. | `learned_mappings` (code→meaning), taxonomy enums, carrier/commodity categories. | Global. **No `client_id`.** Readable via `getSql()`. |
| **1 — Aggregated metrics** | Benchmarks, medians, preventable-loss rates. | cross-client overcharge rates, dispute win-rates by carrier. | Leaves a namespace **only** above the k-anonymity floor, via the audited analytics path. |
| **2 — Raw tenant values** | Rates, denied claims, invoice amounts, contract terms. | `"Invoices"`, `client_insurance_policies`, `policy_rules`, carrier rates. | **Never leave the namespace.** RLS-protected via `getTenantSql()`. |

**Rules locked:**

1. **k-anonymity floor = 5 clients** for any Tier-1 aggregate shown to *a client* or used
   in a client-facing benchmark. Below k, suppress the cell ("insufficient cohort") — do
   not show it. **No floor for internal staff/console analytics** (staff are trusted and
   cross-tenant by role).
2. **Tier-1 aggregates compute through a separate, audited path** — a materialized view or
   dedicated `analytics` role that emits only grouped rows with
   `HAVING count(distinct client_id) >= 5`, never row-level access. This is the single
   sanctioned cross-tenant read surface and is small enough to hand-review.
3. **`learned_mappings` is Tier 0 but needs a scrub guard:** a mapping must be abstract
   (code → meaning) and must **never** carry a rate or amount, so it can't smuggle a
   tenant's price into the global namespace.
4. **`dispute_outcomes` win-rates are Tier 1, not Tier 0.** A carrier-behavior stat
   ("UPS accepts dimensional-reweigh disputes ~70%") feels global, but when computed from
   one client's disputes it leaks that client's volume — so it obeys the k-floor.

**Launch scope: cross-tenant BI is staff-internal only.** No client-facing benchmarks at
launch. This means RLS protects clients, staff (trusted, already cross-tenant) consume
intelligence, and we do **not** build the suppression/k-anonymity engine on day one — it
is required only when the first client-facing benchmark ships. The classification and the
analytics path are built now; the suppression UI is deferred to that milestone.

## Driver mechanics (why the obvious approach fails)

The pasted "industry standard" RLS recipe assumes a Python/SQLAlchemy backend holding a
session connection where `SET app.current_tenant` persists. We have neither Python nor a
persistent session. On the Neon **HTTP** driver, a `SET` issued as its own `.query()` is
a separate request and is **invisible** to the next query — RLS would then read an unset
variable and return **zero rows on every query** (the app breaks, not the attacker). D2's
pooled restricted-role connection is what makes the `SET` + `SELECT` share a backend.

> Side finding worth its own ticket: the existing separate-call `BEGIN/COMMIT` pattern may
> already be auto-committing per statement on the HTTP driver, which would violate
> CLAUDE.md invariant #3 (transaction safety). Flagged here because it surfaced while
> resolving D2; verify and track separately.

## Open branches (being grilled)

### D4 — Array-to-scalar tenancy migration — IN PROGRESS (ADR 0006)
All three legacy business tables now have scalar `client_id` alongside their `text[]` tenancy columns
(verified against DB 2026-06-26): `"Invoices"."Clients"` → `client_id`, `"Disputes"."Client"` → `client_id`,
and `"Audit Results"."Client"` → `client_id`. Platform tables (`policy_*`, `audit_jobs`, etc.) are scalar `client_id text`.

- **All policies use scalar `client_id`.** `USING (client_id = current_setting('app.current_tenant'))`.
  All comparisons are `text` — **never `::uuid`** (keys are text; a uuid cast throws per row).
- **Array columns coexist.** `"Invoices"."Clients"`, `"Disputes"."Client"`, and `"Audit Results"."Client"`
  remain present during transition. Queries use scalar `client_id`; array columns are not dropped yet.
- **Data-quality precondition — already checked and clean (2026-06-26):**

  | Table | rows | multi-client (`cardinality > 1`) | no-client (null/empty) |
  |-------|------|----------------------------------|------------------------|
  | `"Invoices"` | 6 | 0 | 0 |
  | `"Disputes"` | 5 | 0 | 0 |
  | `"Audit Results"` | 6 | 0 | 0 |

  Multi-client rows do not exist today, so array-membership RLS leaks nothing on current
  data, and no orphan (no-client) financial rows would vanish under RLS. **Caveat:** these
  are tiny seed counts, so the result is reassuring, not battle-tested. To *keep* it clean,
  add a `CHECK (cardinality(...) = 1)` (or a single-tenant trigger) on these tables before
  RLS goes live, and re-run this count on real data before enabling RLS in any environment.

### D5 — Phase-1 scope: **Tier-2 crown jewels, proven by a negative test** — LOCKED
RLS rolls out to the high-harm Tier-2 tables first, not all 25 `client_id` tables at once.
The control is only "real" once an automated test enforces it.

- **Phase-1 RLS table set:** `"Invoices"`, `"Audit Results"`, `"Disputes"`,
  `client_insurance_policies`, `insurance_policy_rules`, `policy_rules`,
  `policy_documents`, `client_policies`. (Rates, claims, contract terms — where a leak
  actually hurts.) Low-sensitivity platform tables follow once the pattern is proven.
- **Proof = negative test in CI** (this is the auditor artifact):
  1. Connect as `app_tenant` with **no** `app.current_tenant` set → every protected query
     returns **0 rows**.
  2. Set tenant A → cannot see a seeded tenant-B row, and vice versa.
  A broken policy fails the build.
- **Honest CISO language.** Truthful: *"Tenant data is isolated by database-enforced
  Row-Level Security on a restricted role; a query without an authenticated tenant context
  returns zero rows, verified by automated tests."* **Forbidden:** "cryptographic
  separation" / "physically cannot query your namespace" — that is siloed-instance
  language and is false for a pooled model. Strike it from every deck.

## Phase-1 implementation checklist (when planning ends)

Rollout order is designed so prod cannot silently break:

1. Create restricted `app_tenant` role; grant table privileges (no ownership).
2. Add `getTenantSql(clientId)` — pooled wire connection as `app_tenant`, sets
   `app.current_tenant` for the checkout. Keep `getSql()` (HTTP) for staff/aggregate paths.
3. Add `CHECK (cardinality(...) = 1)` on the three array tables; re-run the multi-client /
   no-client count on real data before enabling RLS in any environment.
4. Add policies on the Phase-1 table set (scalar + array forms; all `text`, never `::uuid`).
5. Write the negative test (both cases above) against a Neon branch.
6. Flip protected reads to `getTenantSql()`; apply `FORCE ROW LEVEL SECURITY` last.
7. Build the Tier-1 analytics path (`HAVING count(distinct client_id) >= 5`) — but the
   client-facing suppression UI is deferred until the first client-facing benchmark (D3).

Open follow-ups spun out of this design:
- Verify/fix the separate-call `BEGIN/COMMIT` atomicity concern (Driver mechanics note).
- `learned_mappings` Tier-0 scrub guard (no rates/amounts) — D3 rule 3.

## Related docs

- `docs/data-layer.md` — connection pattern, tables, migration pattern (this doc adds the
  isolation layer on top of it).
- `docs/auth.md` — where `session.user.clientId` originates.
- `docs/policy-intelligence/06-schema.md` — the most `client_id`-dense tables; primary RLS
  candidates.
