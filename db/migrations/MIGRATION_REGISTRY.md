# Migration Number Registry

> **Owner**: Controller (C0) — formerly E1
> **Updated**: 2026-09-19
> **Production last verified**: 2026-09-19 (read-only, Neon production branch: `_migrations` tracker AND each migration's real schema effect)
> 
> This registry is the single source of truth for migration number allocation.
> All migration-writing tracks MUST claim numbers here before writing SQL.

### What the columns mean

**Repo** — where the migration file is:

- `reserved` — the number is claimed; there is no file yet.
- `on branch` — the file is committed on the working branch (`Gemini-Changes`, PR #1).
- `on main` — the file is merged to `origin/main`. Nothing is yet: `origin/main` currently holds no `db/` folder at all.
- `available` — the number is free to claim.

**Production** — whether the migration is in the production database. Set only after checking BOTH the `_migrations` tracker row AND the schema effect the migration creates:

- `not applied` — neither the tracker row nor the effect is in production.
- `applied` — the tracker row and the effect are both there. For `0000`–`0022` this rests on the tracker rows only; their effects were not individually re-verified.
- `applied, not in tracker` — the effect is in production but there is no `_migrations` row, so it was applied outside `db/migrate.ts`. The runner will re-apply it harmlessly (its statements use `IF NOT EXISTS`) and record it.

| Number | Owner | Repo | Production | Description |
|--------|-------|------|------------|-------------|
| 0000 | — | on branch | applied | Baseline schema (app_users, business tables, seed data) |
| 0001 | — | on branch | applied | Add audit_jobs queue table |
| 0002 | — | on branch | applied | Indexes for client_id, audit performance |
| 0003 | — | on branch | applied | SFTP fetch tracking (sftp_processed_files) |
| 0004 | — | on branch | applied | Gateway insurance intelligence tables |
| 0005 | — | on branch | applied | Policy intelligence MVP (policy tables) |
| 0006 | C0 | on branch | applied | Keystone contract (gateway_decisions, policy_taxonomy_candidates, app_tenant role, RLS) |
| 0007 | — | on branch | applied | Backtest correctness (dollar storage, result tracking) |
| 0008 | — | on branch | applied | Soft delete columns (deleted_at on key tables) |
| 0009 | — | on branch | applied | Audit trail (upload_logs, change tracking) |
| 0010 | — | on branch | applied | Ingestion lineage (source tracking on staged records) |
| 0011 | — | on branch | applied | Grilling schema contract (scalar client_id, CHECK constraints, dispute status) |
| 0012 | — | on branch | applied | Phase 2 extraction pipeline schema (clause_embeddings + pgvector) |
| 0013 | — | on branch | applied | Policy scope exclusions table |
| 0014 | — | on branch | applied | Taxonomy discovery (Phase 4 columns, indexes, taxonomy_admin) |
| 0015 | E4 | on branch | applied | FK constraints (G1) |
| 0016 | E4 | on branch | applied | CHECK constraints (G5) |
| 0017 | E4 | on branch | applied | policy_attestations table (G2+O4) |
| 0018 | E3 | on branch | applied | RLS rollout portal read-set + business table policies + GRANT (ADR 0013) |
| 0019 | E5 | on branch | applied | staff_reviewed column (ADR 0015) |
| 0020 | E5 | on branch | applied | clause_hash index (btree→hash dedup) |
| 0021 | E2 | on branch | applied | gateway_active flag on policy_rulesets |
| 0022 | E3 | on branch | applied | T4 status vocabulary (flagged_at, flagged_by on policy_scope_exclusions) |
| 0023 | E5 | on branch | not applied | Converge insurance_policy_rules → policy_rules |
| 0024 | — | on branch | applied, not in tracker | Vision extraction columns |
| 0025 | — | on branch | applied, not in tracker | Golden examples for few-shot extraction |
| 0026 | H1 | on branch | not applied | subject_type + subject_id columns (Wave 0 keystone, no UNIQUE) |
| 0027 | H4 | on branch | not applied | UNIQUE(subject_type, subject_id, "Detected by") + dedup (Wave 3). Its dedup `DELETE` SET-NULLs `audit_result_id` on policy_backtest_results, gateway_behavioral_tags, shipment_insurance_audit_results (0015 FKs): run a read-only duplicate/child-reference count against production before applying. |
| 0028 | C0 (keystone) | on branch | not applied | vision_attempt_records — append-only extraction attempt history (ADR 0020, Wave 0) |
| 0029 | V2 | on branch | not applied | vision_exception_dedup (ADR 0020, Wave 2) |
| 0030 | V1 | on branch | not applied | rasterizer_config (ADR 0018, Wave 4, optional) |
| 0031 | — | reserved | not applied | degradation-alert state (ADR 0020, Wave 2) |
| 0032 | WO 2026-09-19-002 | on branch | not applied | backtest_result_rule_id_nullable — drops NOT NULL on policy_backtest_results.rule_id so DATA_REQUIRED rows need no synthetic rule; needs HC0 review |
| 0033 | — | available | - | Next migration |

### Reconciliation notes (2026-09-19)

- **0023** is **not applied** in production, although this registry previously said `applied`. It ends with `DROP TABLE IF EXISTS insurance_policy_rules CASCADE`, and that table still exists in production. HC0 should treat it as destructive when approving the batch.
- **0024** and **0025** were marked `applied` and are in production, but were never recorded in `_migrations`, so they were applied outside the runner.
- **0028** was previously marked `applied`; it is **not applied** in production.
- **0031** is reserved (degradation-alert state, ADR 0020) and has no file yet.
- A dry-run of `db/migrate.ts` on a production copy applied `0023`-`0030` and `0032` in order, exit 0, idempotent on re-run (WO 2026-09-19-003). Nothing has been applied to production.

## Allocation Protocol

1. **Check this registry** before writing any `.sql` file.
2. **Reserve your number** by adding a row with Repo `reserved`, Production `not applied`, and your Owner tag.
3. **Update Repo** to `on branch` when the file is committed on the working branch, and to `on main` when it is merged to `origin/main`.
4. **Update Production** only after the migration is applied to production AND you have checked both its `_migrations` row and its schema effect. If it was applied outside `db/migrate.ts`, record `applied, not in tracker`.
5. **Never reuse** a number — numbers are append-only.
6. **Conflicts**: if someone else reserved your target, pick the next available.

## File Naming

```
db/migrations/NNNN_descriptive_snake_name.sql
```

Example: `db/migrations/0026_your_migration_name.sql`
