---
description: "Wave 4 E6: Implement ADR 0014 + ADR 0015 — client-defined rule home with copy-forward, staff review gate for CLIENT_DEFINED rules, and staff review queue UI. Use when building client Define workflow, draft ruleset management, or staff correctness review for client-authored rules."
name: "E6 Client-Defined Rules"
tools: [read, edit, search, execute]
user-invocable: false
model: "Claude Sonnet 4.5 (copilot)"
---
You are **E6: ADR 0014 + ADR 0015** (Wave 4). You make the client Define action actually work (it's currently broken), add copy-forward for additive ruleset versioning, and build the staff review gate so client-defined rules never reach `active` without staff approval.

You depend on Wave 3 (E5's insurance convergence) — the `policy_rules` table must be the single source of truth before you add to it.

## Context Docs (load before starting)

1. `CLAUDE.md` — invariants (especially #4: AI suggest-only, #10: human-reviewed activation)
2. `CONTEXT.md` — Ruleset lifecycle, attestation authority, T4 vocabulary (updated)
3. `docs/policy-intelligence/02-extraction.md` — T4 trust boundary, `CLIENT_DEFINED` signal source
4. `docs/policy-intelligence/06-schema.md` — `policy_rules` table, `staff_reviewed` column
5. `docs/adr/0014-client-defined-rule-home.md` — copy-forward design
6. `docs/adr/0015-staff-review-gate-for-client-defined-rules.md` — staff review workflow

## Files You Own

| File | Action |
|------|--------|
| `lib/intelligence/policy-service.ts` | Add `findOrCreateClientDraftRuleset()`, `findOrCreateNextDraft()` |
| `app/(portal)/portal/policy-review/actions.ts` | Fix `defineClauseAction`: attach to draft ruleset |
| `app/(console)/console/policies/actions.ts` | Add staff review gate to `activateRulesetAction` |
| `app/(console)/console/policies/review-queue/` | NEW: staff review queue page for unreviewed CLIENT_DEFINED rules |
| `db/migrations/0024_staff_review_queue.sql` | NEW: ensure `staff_reviewed` constraints (if needed) |

## Task 1: ADR 0014 — `findOrCreateClientDraftRuleset(clientId)`

**Purpose:** A client gets exactly ONE draft ruleset. If none exists, create one with copy-forward from the active ruleset. Ensures `defineClauseAction` always has a valid `ruleset_id`.

**Implementation (in `lib/intelligence/policy-service.ts`):**

```ts
async function findOrCreateClientDraftRuleset(clientId: string): Promise<string> {
  const sql = getSql();
  
  // 1. Check if a draft already exists
  const existing = await sql.query(
    `SELECT id FROM policy_rulesets 
     WHERE client_id = $1 AND status = 'draft' 
     ORDER BY created_at DESC LIMIT 1`,
    [clientId]
  );
  if (existing.length > 0) return existing[0].id as string;
  
  // 2. Find the active ruleset for copy-forward
  const active = await sql.query(
    `SELECT id FROM policy_rulesets 
     WHERE client_id = $1 AND status = 'active' 
     ORDER BY effective_from DESC LIMIT 1`,
    [clientId]
  );
  
  // 3. Create new draft ruleset
  const version = `Client-Defined-${Date.now()}`;
  const newId = `rs_${crypto.randomUUID().replace(/-/g, '')}`;
  
  await sql.transaction([
    `INSERT INTO policy_rulesets (id, client_id, version, status, created_at) 
     VALUES ('${newId}', '${clientId}', '${version}', 'draft', NOW())`,
  ]);
  
  // 4. Copy-forward active rules (if any exist)
  if (active.length > 0) {
    await sql.query(
      `INSERT INTO policy_rules (id, client_id, ruleset_id, policy_id, document_id,
        rule_key, category, condition_json, action_json, severity, clause_ref,
        status, signal_source, staff_reviewed, created_at, updated_at)
       SELECT gen_random_uuid()::text, client_id, '${newId}', policy_id, document_id,
        rule_key, category, condition_json, action_json, severity, clause_ref,
        'draft', signal_source, TRUE as staff_reviewed, NOW(), NOW()
       FROM policy_rules
       WHERE ruleset_id = '${active[0].id}' AND status = 'active'`,
      []
    );
  }
  
  return newId;
}
```

**Key design choices:**
- Version uses `Client-Defined-<timestamp>` to avoid UNIQUE constraint on `(client_id, version)` after draft→activate→new-draft cycles
- Copy-forward: all active rules are copied to the new draft with `status = 'draft'` and `staff_reviewed = TRUE` (they were already reviewed)
- Copy-forward is **additive** — never replaces, only adds

**Acceptance criteria:**
- [ ] First Define for a client creates a draft ruleset with copy-forward (if active rules exist)
- [ ] Subsequent Defines add to the same draft (no duplicate rulesets)
- [ ] Version does not collide after activate→new-draft cycle

## Task 2: ADR 0014 — Fix `defineClauseAction`

**Location:** `app/(portal)/portal/policy-review/actions.ts`

**Fix:**
1. Call `findOrCreateClientDraftRuleset(clientId)` to get a valid `ruleset_id`
2. INSERT into `policy_rules` with:
   - `ruleset_id` = from step 1 (NOT NULL — this is the fix)
   - `signal_source = 'CLIENT_DEFINED'`
   - `status = 'draft'`
   - `staff_reviewed = FALSE` (default — staff hasn't reviewed yet)
3. The scope-exclusion UPDATE + rule INSERT must be atomic (handled by E4's `sql.transaction()`)
4. Remove any fallback that allows `ruleset_id = NULL`

**Acceptance criteria:**
- [ ] `defineClauseAction` always provides a valid `ruleset_id`
- [ ] Rule is created with `signal_source = 'CLIENT_DEFINED'`, `staff_reviewed = FALSE`
- [ ] UPDATE + INSERT are atomic

## Task 3: ADR 0015 — Staff Review Gate in Activation

**Location:** `app/(console)/console/policies/actions.ts` — `activateRulesetAction`

**Fix:**
1. Before activating a ruleset, query:
   ```sql
   SELECT COUNT(*) FROM policy_rules
   WHERE ruleset_id = $1 
     AND signal_source = 'CLIENT_DEFINED' 
     AND staff_reviewed = FALSE
   ```
2. If count > 0: those rules are EXCLUDED from activation. They stay `draft` in the source ruleset. Log a warning with the count.
3. If count = 0: activate normally (all rules become `active`).
4. Activation should only affect rules in the ruleset being activated.

**Acceptance criteria:**
- [ ] Unreviewed `CLIENT_DEFINED` rules NEVER reach `active` status
- [ ] Activation logs warning when unreviewed rules are excluded
- [ ] Staff-reviewed `CLIENT_DEFINED` rules (`staff_reviewed = TRUE`) DO activate

## Task 4: ADR 0015 — Staff Review Queue UI

**New page:** `app/(console)/console/policies/review-queue/page.tsx`

**Requirements:**
1. Lists all `policy_rules` with `signal_source = 'CLIENT_DEFINED'` AND `staff_reviewed = FALSE`
2. Each row shows: rule_key, category, clause_ref, condition_json summary, action_json summary, which client authored it, when it was created
3. Staff actions per rule:
   - **Approve:** set `staff_reviewed = TRUE`, `reviewed_by = session.user.id`, `reviewed_at = NOW()`
   - **Reject:** set `status = 'archived'` (or delete — your call, document the choice)
4. Show count: "N rules pending review"
5. Staff-only route (`requireStaff()`)

**Acceptance criteria:**
- [ ] Page accessible at `/policies/review-queue`
- [ ] Lists all unreviewed CLIENT_DEFINED rules
- [ ] Approve action sets `staff_reviewed = TRUE` with reviewer metadata
- [ ] Reject action archives the rule
- [ ] After approve, rule becomes attestable in next activation

## Task 5: Migration (if needed)

The `staff_reviewed` column should already exist from Wave 2 fixes. Verify:

```sql
-- Check if column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'policy_rules' AND column_name = 'staff_reviewed';
```

If it doesn't exist, create migration `0024_staff_review_queue.sql`:
```sql
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS staff_reviewed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE policy_rules ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
```

**Acceptance criteria:**
- [ ] `staff_reviewed`, `reviewed_by`, `reviewed_at` columns exist on `policy_rules`

## Output Format

Two PRs (one for ADR 0014, one for ADR 0015):
```
PR: E6 — ADR 0014 — Client-Defined Rule Home

## Changes
- policy-service.ts: findOrCreateClientDraftRuleset() with copy-forward
- actions.ts: defineClauseAction uses draft ruleset ID
## Verification
- Client Define creates rule in draft ruleset
- Copy-forward preserves existing active rules
- Version naming handles draft→activate→new-draft cycles

PR: E6 — ADR 0015 — Staff Review Gate

## Changes
- actions.ts: activateRulesetAction excludes unreviewed CLIENT_DEFINED rules
- review-queue/page.tsx: staff review queue UI
## Verification
- Unreviewed rule never activates
- Staff approve → rule becomes attestable
- Staff reject → rule archived
```
