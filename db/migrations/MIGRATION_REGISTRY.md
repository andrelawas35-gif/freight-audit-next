# Migration Number Registry

> **Owner**: E1 (Platform / Migration Toolchain)
> **Updated**: 2026-06-26
> 
> This registry is the single source of truth for migration number allocation.
> All migration-writing tracks (E3, E4, E5) MUST claim numbers here before writing SQL.

| Number | Owner | Status | Description |
|--------|-------|--------|-------------|
| 0000 | — | applied | Baseline schema (app_users, business tables, seed data) |
| 0001 | — | applied | Add audit_jobs queue table |
| 0002 | — | applied | Indexes for client_id, audit performance |
| 0003 | — | applied | SFTP fetch tracking (sftp_processed_files) |
| 0004 | — | applied | Gateway insurance intelligence tables |
| 0005 | — | applied | Policy intelligence MVP (policy tables) |
| 0006 | — | applied | Keystone contract (gateway_decisions, policy_taxonomy_candidates, app_tenant role, RLS) |
| 0007 | — | applied | Backtest correctness (dollar storage, result tracking) |
| 0008 | — | applied | Soft delete columns (deleted_at on key tables) |
| 0009 | — | applied | Audit trail (upload_logs, change tracking) |
| 0010 | — | applied | Ingestion lineage (source tracking on staged records) |
| 0011 | — | applied | Grilling schema contract (CHECK constraints, column normalization) |
| 0012 | — | applied | Phase 2 extraction pipeline schema |
| 0013 | — | applied | Policy scope exclusions table |
| 0014 | — | applied | Taxonomy discovery (Phase 4 columns, indexes, taxonomy_admin) |
| 0015 | E4 | reserved | FK constraints (G1) |
| 0016 | E4 | reserved | CHECK constraints (G5) |
| 0017 | E4 | reserved | policy_attestations table (G2+O4) |
| 0018 | E3 | created | RLS rollout portal read-set (ADR 0013) |
| 0019 | E5 | created | staff_reviewed column (ADR 0015) |
| 0020 | E5 | created | clause_hash index |
| 0021 | E5 | reserved | T3 batch index / pipeline schema |

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

Example: `db/migrations/0019_staff_reviewed_column.sql`
