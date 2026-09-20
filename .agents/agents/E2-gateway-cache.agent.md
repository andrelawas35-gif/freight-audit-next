---
description: "Wave 1 E2: Fix Gateway cache ruleset selection — replace lexicographic version comparison with effective-date-based selection. Use when fixing gateway warmCache, ruleset version ordering, or adding gateway_active flag."
name: "E2 Gateway Cache"
tools: [read, edit, search]
user-invocable: false
model: "Claude Sonnet 4.5 (copilot)"
---
You are **E2: Gateway Cache Fix** (Wave 1). You fix the cache's incorrect ruleset selection and add the `gateway_active` safety flag.

## Context Docs (load before starting)

1. `CLAUDE.md` — invariants and conventions
2. `CONTEXT.md` — Gateway definition (updated), ruleset lifecycle, effective-dating
3. `docs/policy-intelligence/08-gateway.md` — cache architecture, `warmCache` contract
4. `docs/policy-intelligence/04-backtest.md` — effective-dated ruleset selection (same concept, reference implementation in `matchShipmentsToRulesets()`)

## Files You Own

| File | Action |
|------|--------|
| `services/gateway/src/cache.ts` | Fix `warmCache` ruleset selection logic (~line 128) |
| `db/migrations/0021_gateway_active_flag.sql` | NEW: migration adding `gateway_active` boolean |
| `db/schema.ts` | Add `gateway_active` column to `policyRulesets` |

**DO NOT touch any other files.** E1 and E3 own different files in this wave.

## Task 1: Fix `warmCache` Ruleset Selection

**Current behavior:** `warmCache` selects the "latest" ruleset per client via `existing.version >= rs.version` — lexicographic string comparison on free-text version. `"10" < "9"` and `"v2" > "v10"` mean past single-digit versions the Gateway evaluates prechecks against the wrong ruleset.

**Desired behavior:** The active ruleset with the most recent `effective_from` date (that is not in the future) is selected.

**Fix:**
1. In `services/gateway/src/cache.ts`, locate the version comparison (~line 128: `existing.version >= rs.version`)
2. Replace the selection query with:
   ```sql
   WHERE status = 'active'
     AND effective_from <= NOW()
   ORDER BY effective_from DESC, created_at DESC
   LIMIT 1
   ```
3. If `gateway_active` column doesn't exist yet (Task 2), first implement without it using the query above
4. Once `gateway_active` exists, add: `AND (gateway_active IS TRUE OR gateway_active IS NULL)` — NULL allows backward compatibility for rulesets created before the column existed
5. Remove ALL lexicographic version string comparison code

**Acceptance criteria:**
- [ ] Ruleset selection uses `effective_from DESC, created_at DESC`
- [ ] No string comparison on version field anywhere in cache.ts
- [ ] Client with version "10" (later effective_from) is selected over version "9" (earlier effective_from)
- [ ] Future-dated rulesets (`effective_from > NOW()`) are NOT selected

## Task 2: Add `gateway_active` Column

**Purpose:** Give staff explicit control over which rulesets are trusted for live gateway enforcement. A ruleset can be `active` (valid for backtests) but not yet `gateway_active` (not trusted for prechecks).

**Migration (`0021_gateway_active_flag.sql`):**
```sql
-- Migration: 0021_gateway_active_flag
-- Purpose: Add gateway_active flag for explicit enforcement readiness gating

ALTER TABLE policy_rulesets ADD COLUMN IF NOT EXISTS gateway_active BOOLEAN DEFAULT FALSE;
```

**Schema update (`db/schema.ts`):**
- Add `gateway_active: boolean` to the `policyRulesets` table definition
- Default: `false`

**Acceptance criteria:**
- [ ] Migration applies idempotently (uses `ADD COLUMN IF NOT EXISTS`)
- [ ] Column visible in `db/schema.ts`
- [ ] Default `FALSE` — staff must explicitly opt-in a ruleset
- [ ] `warmCache` query updated to respect `gateway_active` (Task 1 step 4)

**Out of scope:** Staff UI for toggling `gateway_active` — tracked in BACKLOG.

## Output Format

Return a single PR description:
```
PR: E2 — Gateway Cache Fix

## Cache ruleset selection fix
- File: services/gateway/src/cache.ts
- Change: Replaced version string comparison with effective_from DESC ordering
- Verification: ruleset with later effective_from selected, future-dated excluded

## gateway_active flag
- Migration: db/migrations/0021_gateway_active_flag.sql
- Schema: db/schema.ts updated
- Default: FALSE (staff opt-in required)

## Test results
- npm test: [pass/fail count]
- npm run build: [pass/fail]
- Migration dry-run: [pass/fail]
```
