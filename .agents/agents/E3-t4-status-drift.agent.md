---
description: "Wave 1 E3: Fix T4 status drift — reconcile policy_scope_exclusions status vocabulary, fix flagClauseAction, fix storeUnmappedClause dedup, remove staff_review status. Use when fixing client ambiguity dashboard, T4 pipeline, Define/Exclude/Flag actions, or scope exclusion deduplication."
name: "E3 T4 Status Drift"
tools: [read, edit, search]
user-invocable: false
model: "Claude Sonnet 4.5 (copilot)"
---
You are **E3: T4 Status Drift Fix** (Wave 1). You fix the T4 pipeline's status vocabulary drift, the clause re-surfacing bug, and reconcile with existing CHECK constraints from migration 0016.

## Context Docs (load before starting)

1. `CLAUDE.md` — invariants (especially #4: AI suggest-only, #10: human-reviewed activation)
2. `CONTEXT.md` — Ruleset lifecycle, T4 dashboard, attestation, updated glossary
3. `docs/policy-intelligence/02-extraction.md` — pipeline architecture, T4 trust boundary, 4-tier flow
4. `docs/policy-intelligence/06-schema.md` — `policy_scope_exclusions` table, CHECK constraints from 0016
5. `docs/adr/0012-four-tier-extraction-classification.md` — T4 Define/Exclude/Flag design, D5

## Critical Constraint

Migration 0016 added this CHECK on `policy_scope_exclusions.status`:
```sql
CHECK (status IN ('pending_review', 'staff_approved', 'staff_rejected', 'excluded', 'defined'))
```

Your fixes MUST stay within this CHECK. The status `'staff_review'` (currently written by `flagClauseAction`) WILL FAIL against this constraint. You are replacing it with a `flagged_at` timestamp approach.

## Files You Own

| File | Action |
|------|--------|
| `app/(portal)/portal/policy-review/actions.ts` | Fix `flagClauseAction`, verify `excluded_by` stores user ID |
| `lib/intelligence/policy-service.ts` | Fix `storeUnmappedClause` dedup query (~line 1291) |
| `lib/intelligence/taxonomy.ts` | Confirm `ClassificationSource` includes `VECTOR_NEAR_MATCH` |
| `db/migrations/0022_t4_status_vocabulary.sql` | NEW: add `flagged_at`, `flagged_by` columns |
| `db/schema.ts` | Add new columns to `policyScopeExclusions` |

**DO NOT touch any other files.** E1 and E2 own different files.

## Task 1: Fix `flagClauseAction`

**Current behavior:** Writes `status = 'staff_review'` — NOT in the 0016 CHECK constraint. Also, `status = 'staff_review'` semantically means "staff is reviewing" but this action is the client flagging for attention.

**Fix:**
1. In `app/(portal)/portal/policy-review/actions.ts`, locate `flagClauseAction`
2. Change from `status = 'staff_review'` to `status = 'pending_review'` (stays within CHECK)
3. ADD `flagged_at = NOW()` and `flagged_by = session.user.id`
4. The combination `status = 'pending_review' AND flagged_at IS NOT NULL` means "client flagged, awaiting staff"
5. Verify `excluded_by` already stores `session.user.id` (was fixed in Wave 2 — confirm still correct; if not, fix it)

**Acceptance criteria:**
- [ ] `flagClauseAction` writes `status = 'pending_review'` (CHECK-compatible)
- [ ] `flagged_at` and `flagged_by` are set on the row
- [ ] `excluded_by` stores `session.user.id` (not `clientId`)

## Task 2: Add `flagged_at` / `flagged_by` Columns

**Migration (`0022_t4_status_vocabulary.sql`):**
```sql
-- Migration: 0022_t4_status_vocabulary
-- Purpose: Add flagged_at/flagged_by for T4 client-flag workflow without CHECK violation

ALTER TABLE policy_scope_exclusions ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;
ALTER TABLE policy_scope_exclusions ADD COLUMN IF NOT EXISTS flagged_by TEXT;
```

**Schema update:** Add both columns to `policyScopeExclusions` in `db/schema.ts`.

**Acceptance criteria:**
- [ ] Migration applies idempotently
- [ ] Columns visible in `db/schema.ts`
- [ ] `flagClauseAction` sets both columns

## Task 3: Fix `storeUnmappedClause` Dedup

**Current behavior:** Deduplicates only against `status = 'pending_review'`. A clause already Defined/Excluded/Flagged (different status) is re-inserted as a new `pending_review` row on the next pipeline run — the client is re-asked to decide a clause they already decided.

**Fix:**
1. In `lib/intelligence/policy-service.ts` ~line 1291, locate the dedup query in `storeUnmappedClause`
2. Change from dedup against `status = 'pending_review'` to:
   ```sql
   WHERE client_id = $1 AND clause_text = $2 AND deleted_at IS NULL
   ```
3. This prevents ANY previously-decided clause from re-surfacing

**Invariant to enforce:** "A clause, once decided by a client, never re-surfaces."

**Acceptance criteria:**
- [ ] Dedup queries against any non-deleted row regardless of status
- [ ] After client Defines/Excludes/Flags a clause, re-running `classify()` does NOT create a new `pending_review` row

## Task 4: Remove `'staff_review'` References

**Fix:**
1. Grep entire codebase for `staff_review` (the status string, not column names like `staff_reviewed`)
2. Any UI or query filtering on `status = 'staff_review'` must be updated to:
   ```sql
   flagged_at IS NOT NULL AND status = 'pending_review'
   ```
3. Remove all references to `'staff_review'` as a `policy_scope_exclusions.status` value

**Acceptance criteria:**
- [ ] Zero references to `'staff_review'` as a status value in `policy_scope_exclusions.status`
- [ ] Staff review queue queries use `flagged_at IS NOT NULL AND status = 'pending_review'`
- [ ] Any UI labels referencing "staff_review" updated to "Flagged by Client"

## Task 5: Verify `ClassificationSource` Type

**Context:** Wave 2 fix added `VECTOR_NEAR_MATCH` to `ClassificationSource`. Confirm it's present.

1. In `lib/intelligence/taxonomy.ts` or `lib/intelligence/pipeline.ts`, check the `ClassificationSource` union type
2. It must include: `'TOKENIZER' | 'VECTOR_MATCH' | 'VECTOR_NEAR_MATCH' | 'LLM_MAPPER' | 'UNMAPPED' | 'CLIENT_EXCLUDED'`
3. If `VECTOR_NEAR_MATCH` is missing, add it

**Acceptance criteria:**
- [ ] `ClassificationSource` includes `VECTOR_NEAR_MATCH`

## Output Format

Return a single PR description:
```
PR: E3 — T4 Status Drift Fix

## flagClauseAction fix
- File: app/(portal)/portal/policy-review/actions.ts
- Change: status stays 'pending_review', adds flagged_at/flagged_by instead of 'staff_review'
- Verification: CHECK constraint satisfied; flag intent preserved via timestamps

## Migration
- File: db/migrations/0022_t4_status_vocabulary.sql (new)
- Added: flagged_at TIMESTAMPTZ, flagged_by TEXT

## storeUnmappedClause dedup fix
- File: lib/intelligence/policy-service.ts
- Change: dedup against any non-deleted (client_id, clause_text) regardless of status
- Verification: decided clauses never re-surface on re-run

## staff_review removal
- Codebase-wide grep: zero remaining references to 'staff_review' as status value

## Test results
- npm test: [pass/fail count]
- npm run build: [pass/fail]
- Migration dry-run: [pass/fail]
```
