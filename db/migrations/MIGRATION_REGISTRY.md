# Migration Number Registry

> **Owner**: Controller (C0) — formerly E1
> **Updated**: 2026-09-19
> 
> This registry is the single source of truth for migration number allocation.
> All migration-writing tracks MUST claim numbers here before writing SQL.

| Number | Owner | Status | Description |
|--------|-------|--------|-------------|
| 0000 | — | applied | Baseline schema (app_users, business tables, seed data) |
| 0001 | — | applied | Add audit_jobs queue table |
| 0002 | — | applied | Indexes for client_id, audit performance |
| 0003 | — | applied | SFTP fetch tracking (sftp_processed_files) |
| 0004 | — | applied | Gateway insurance intelligence tables |
| 0005 | — | applied | Policy intelligence MVP (policy tables) |
| 0006 | C0 | applied | Keystone contract (gateway_decisions, policy_taxonomy_candidates, app_tenant role, RLS) |
| 0007 | — | applied | Backtest correctness (dollar storage, result tracking) |
| 0008 | — | applied | Soft delete columns (deleted_at on key tables) |
| 0009 | — | applied | Audit trail (upload_logs, change tracking) |
| 0010 | — | applied | Ingestion lineage (source tracking on staged records) |
| 0011 | — | applied | Grilling schema contract (scalar client_id, CHECK constraints, dispute status) |
| 0012 | — | applied | Phase 2 extraction pipeline schema (clause_embeddings + pgvector) |
| 0013 | — | applied | Policy scope exclusions table |
| 0014 | — | applied | Taxonomy discovery (Phase 4 columns, indexes, taxonomy_admin) |
| 0015 | E4 | applied | FK constraints (G1) |
| 0016 | E4 | applied | CHECK constraints (G5) |
| 0017 | E4 | applied | policy_attestations table (G2+O4) |
| 0018 | E3 | applied | RLS rollout portal read-set + business table policies + GRANT (ADR 0013) |
| 0019 | E5 | applied | staff_reviewed column (ADR 0015) |
| 0020 | E5 | applied | clause_hash index (btree→hash dedup) |
| 0021 | E2 | applied | gateway_active flag on policy_rulesets |
| 0022 | E3 | applied | T4 status vocabulary (flagged_at, flagged_by on policy_scope_exclusions) |
| 0023 | E5 | applied | Converge insurance_policy_rules → policy_rules |
| 0024 | — | applied | Vision extraction columns |
| 0025 | — | applied | Golden examples for few-shot extraction |
| 0026 | H1 | pending | subject_type + subject_id columns (Wave 0 keystone, no UNIQUE) — in repo; not yet applied to production |
| **0027** | **H4** | **pending** | **UNIQUE(subject_type, subject_id, "Detected by") + dedup (Wave 3) — in repo; not yet applied to production. Its dedup `DELETE` SET-NULLs `audit_result_id` on policy_backtest_results, gateway_behavioral_tags, shipment_insurance_audit_results (0015 FKs): run a read-only duplicate/child-reference count against production before applying.** |
| **0028** | **C0 (keystone)** | **applied** | **vision_attempt_records — append-only extraction attempt history (ADR 0020, Wave 0)** |
| **0029** | **V2** | **reserved** | **vision_exception_dedup (ADR 0020, Wave 2)** |
| **0030** | **V1** | **reserved** | **rasterizer_config (ADR 0018, Wave 4, optional)** |
| **0031** | **—** | **reserved** | **degradation-alert state (ADR 0020, Wave 2)** |
| **0032** | **—** | **available** | **Next migration** |

## Allocation Protocol

1. **Check this registry** before writing any `.sql` file.
2. **Reserve your number** by adding a row with Status `reserved` and your Owner tag.
3. **Update status to `applied`** after your migration is merged to `main`.
4. **Never reuse** a number — numbers are append-only.
5. **Conflicts**: if someone else reserved your target, pick the next available.

## File Naming

```
db/migrations/NNNN_descriptive_snake_name.sql
```

Example: `db/migrations/0026_your_migration_name.sql`
