/*
  lib/db/records.ts — data-access layer for Postgres-backed records.

  Exports: fetchRecords, fetchRecord, createRecord, updateRecord, batchCreate.
  Postgres tables use quoted column names matching legacy Airtable field names
  (e.g. "Invoice number"), so SELECT * returns rows keyed as expected. Link/relationship
  fields are stored as text[] arrays of record IDs.

  Usage in any page:
    import { fetchRecords } from '@/lib/db/records';
    const disputes = await fetchRecords('Disputes', { filterByFormula: `{Status} = 'Open'` });

  Tenant-restricted reads (ADR 0013):
    const db = await getTenantSql(clientId);
    try {
      const rows = await fetchRecords('Invoices', { filterByFormula: ... }, db);
    } finally {
      db.release();
    }
*/

import { getSql } from '@/lib/db';

/** Shared query interface — works for both neon HTTP driver and PoolClient. */
export type SqlLike = {
  query: (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
};

// ── Soft-delete gating ───────────────────────────────────────────
// Only tables that actually have a `deleted_at` column get the
// `deleted_at IS NULL` filter in SELECT queries.  This prevents
// crashes on tables like `"Carrier Codes"` that lack the column.
// Keep this set in sync with migrations that add deleted_at columns.
export const SOFT_DELETE_TABLES: ReadonlySet<TableName> = new Set<TableName>([
  'Invoices',
  'Shipments',
  'Audit Results',
  'Disputes',
  'Clients',
  'Carriers',
  'rulebook',
  'client_policies',
  'policy_documents',
  'policy_rulesets',
  'policy_rules',
  'policy_scope_exclusions',
  'policy_taxonomy_candidates',
  'ingestion_exceptions',
  'ingestion_batches',
  'ingestion_records',
]);

// ── table name shortcuts ─────────────────────────────────────
// These map 1:1 to Postgres table names (quoted, case-sensitive).
export type TableName =
  | 'Invoices'
  | 'Invoice Lines'
  | 'Shipments'
  | 'Audit Results'
  | 'Disputes'
  | 'SLA Guarantees'
  | 'Carriers'
  | 'Clients'
  | 'Carrier Codes'
  | 'Audit Rules'
  | 'Charge Types'
  | 'DAS Zip Codes'
  | 'rulebook'
  | 'client_policies'
  | 'policy_documents'
  | 'policy_rulesets'
  | 'policy_rules'
  | 'gateway_behavioral_tags'
  | 'gateway_decisions'
  | 'client_insurance_policies'
  | 'policy_scope_exclusions'
  | 'ingestion_exceptions'
  | 'ingestion_batches'
  | 'ingestion_records'
  | 'audit_trail'
  | 'policy_taxonomy_candidates'
  | 'policy_backtest_runs'
  | 'policy_backtest_results'
  | 'gateway_readiness_assessments'
  | 'upload_log'
  | 'sftp_processed_files'
  | 'audit_jobs';

type Row = { id: string; [key: string]: unknown };

export type RecordQueryOptions = {
  filterByFormula?: string;
  sort?: { field: string; direction?: 'asc' | 'desc' }[];
  maxRecords?: number;
  fields?: string[];   // accepted for compatibility; we always SELECT *
  view?: string;       // accepted for compatibility; ignored
};

const DEFAULT_RECORD_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 500;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

// ── filterByFormula → SQL WHERE translator ───────────────────
// Supports exactly the Airtable formula shapes this codebase uses:
//   {Field} = 'value'           → "Field" = $n
//   {Field} = "value"           → "Field" = $n
//   RECORD_ID() = "rec123"      → id = $n
//   OR(expr, expr, ...)         → (expr OR expr ...)
//   AND(expr, expr, ...)        → (expr AND expr ...)
//   FIND("rec123", ARRAYJOIN({Link})) → $n = ANY("Link") (backward compat for array cols)
//   {Client} = "id" / {Clients} = "id"      → client_id = $n (scalar ADR 0006)
// Throws on anything unrecognized so we never silently return wrong data.
export function translateFormula(
  formula: string,
  params: unknown[]
): string {
  const f = formula.trim();

  // OR(...) / AND(...)
  const logical = /^(OR|AND)\s*\(([\s\S]*)\)$/i.exec(f);
  if (logical) {
    const op = logical[1].toUpperCase();
    const inner = logical[2];
    const parts = splitTopLevel(inner).map((p) => translateFormula(p, params));
    return `(${parts.join(` ${op} `)})`;
  }

  // FIND("value", ARRAYJOIN({Field}))  → membership test on a text[] column (backward compat)
  const find = /^FIND\(\s*["']([\s\S]+?)["']\s*,\s*ARRAYJOIN\(\s*\{([\s\S]+?)\}\s*\)\s*\)$/i.exec(f);
  if (find) {
    const value = find[1];
    const field = find[2];
    params.push(value);
    return `$${params.length} = ANY(${quoteIdent(field)})`;
  }

  // RECORD_ID() = "rec123"
  const recId = /^RECORD_ID\(\)\s*=\s*["']([\s\S]+?)["']$/i.exec(f);
  if (recId) {
    params.push(recId[1]);
    return `id = $${params.length}`;
  }

  // {Field} = 'value'  or  {Field} = "value"
  // Map legacy array tenancy field names {Client}/{Clients} → scalar client_id (ADR 0006)
  const eq = /^\{([\s\S]+?)\}\s*=\s*["']([\s\S]*)["']$/i.exec(f);
  if (eq) {
    const field = eq[1];
    const value = eq[2];
    params.push(value);
    const col = (field === 'Client' || field === 'Clients') ? 'client_id' : field;
    return `${quoteIdent(col)} = $${params.length}`;
  }

  throw new Error(`Unsupported filterByFormula expression: ${formula}`);
}

// Split a comma-separated argument list at the top level only
// (ignores commas nested inside parentheses or quotes).
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

// Quote an identifier (table or column), escaping embedded quotes.
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── read records ─────────────────────────────────────────────
// Returns a flat array of { id, ...fields } objects — same shape as before.
// Optional `db` param for tenant-restricted reads (ADR 0013).
export async function fetchRecords(
  tableName: TableName,
  options: RecordQueryOptions = {},
  db?: SqlLike,
): Promise<Row[]> {
  const sql = db ?? getSql();
  const params: unknown[] = [];

  let query = `SELECT * FROM ${quoteIdent(tableName)}`;

  const hasFilter = options.filterByFormula && options.filterByFormula.trim();
  const clauses: string[] = [];
  if (hasFilter) {
    clauses.push(translateFormula(options.filterByFormula!, params));
  }
  if (SOFT_DELETE_TABLES.has(tableName)) {
    clauses.push(`${quoteIdent(tableName)}."deleted_at" IS NULL`);
  }
  if (clauses.length) {
    query += ` WHERE ${clauses.join(' AND ')}`;
  }

  if (options.sort && options.sort.length) {
    const orderBy = options.sort
      .map((s) => `${quoteIdent(s.field)} ${s.direction === 'desc' ? 'DESC' : 'ASC'}`)
      .join(', ');
    query += ` ORDER BY ${orderBy}`;
  }

  const limit = positiveInteger(options.maxRecords ?? DEFAULT_RECORD_LIMIT, 'maxRecords');
  params.push(limit);
  query += ` LIMIT $${params.length}`;

  const rows = (await sql.query(query, params)) as Row[];
  return rows;
}

// Read every matching row using stable keyset pagination. This is intended for
// financial-processing paths where an arbitrary LIMIT would silently omit data.
// UI pages should continue using fetchRecords() with an explicit display limit.
export async function fetchAllRecords(
  tableName: TableName,
  options: Omit<RecordQueryOptions, 'maxRecords' | 'sort'> & {
    pageSize?: number;
    createdBefore?: string;
  } = {},
  db?: SqlLike,
): Promise<Row[]> {
  const sql = db ?? getSql();
  const pageSize = positiveInteger(options.pageSize ?? DEFAULT_PAGE_SIZE, 'pageSize');
  const rows: Row[] = [];
  let afterId: string | null = null;

  while (true) {
    const params: unknown[] = [];
    const where: string[] = [];

    if (options.filterByFormula && options.filterByFormula.trim()) {
      where.push(translateFormula(options.filterByFormula, params));
    }
    if (options.createdBefore) {
      params.push(options.createdBefore);
      where.push(`created_at <= $${params.length}::timestamptz`);
    }
    if (afterId) {
      params.push(afterId);
      where.push(`id > $${params.length}`);
    }
    if (SOFT_DELETE_TABLES.has(tableName)) {
      where.push(`${quoteIdent(tableName)}."deleted_at" IS NULL`);
    }

    let query = `SELECT * FROM ${quoteIdent(tableName)}`;
    if (where.length) query += ` WHERE ${where.join(' AND ')}`;
    query += ' ORDER BY id ASC';
    params.push(pageSize);
    query += ` LIMIT $${params.length}`;

    const page = (await sql.query(query, params)) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
    afterId = page[page.length - 1].id;
  }

  return rows;
}

// Resolve linked records in bounded chunks without constructing a very large
// OR formula or truncating at an arbitrary record limit.
export async function fetchRecordsByIds(
  tableName: TableName,
  recordIds: string[],
  chunkSize = DEFAULT_PAGE_SIZE,
  db?: SqlLike,
): Promise<Row[]> {
  const sql = db ?? getSql();
  const size = positiveInteger(chunkSize, 'chunkSize');
  const uniqueIds = [...new Set(recordIds.filter(Boolean))];
  const rows: Row[] = [];
  const softDeleteClause = SOFT_DELETE_TABLES.has(tableName)
    ? ` AND ${quoteIdent(tableName)}."deleted_at" IS NULL`
    : '';

  for (let i = 0; i < uniqueIds.length; i += size) {
    const chunk = uniqueIds.slice(i, i + size);
    const page = (await sql.query(
      `SELECT * FROM ${quoteIdent(tableName)} WHERE id = ANY($1::text[])${softDeleteClause} ORDER BY id ASC`,
      [chunk]
    )) as Row[];
    rows.push(...page);
  }

  return rows;
}

// Fetch rows whose Airtable-style linked-record array overlaps a set of ids.
// Results are de-duplicated because one row may overlap more than one chunk.
export async function fetchRecordsByLinkedIds(
  tableName: TableName,
  linkField: string,
  linkedIds: string[],
  chunkSize = DEFAULT_PAGE_SIZE,
  db?: SqlLike,
): Promise<Row[]> {
  const sql = db ?? getSql();
  const size = positiveInteger(chunkSize, 'chunkSize');
  const uniqueIds = [...new Set(linkedIds.filter(Boolean))];
  const byId = new Map<string, Row>();
  const softDeleteClause = SOFT_DELETE_TABLES.has(tableName)
    ? ` AND ${quoteIdent(tableName)}."deleted_at" IS NULL`
    : '';

  for (let i = 0; i < uniqueIds.length; i += size) {
    const chunk = uniqueIds.slice(i, i + size);
    const page = (await sql.query(
      `SELECT * FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(linkField)} && $1::text[]${softDeleteClause} ORDER BY id ASC`,
      [chunk]
    )) as Row[];
    for (const row of page) byId.set(row.id, row);
  }

  return [...byId.values()];
}

// ── read one record ──────────────────────────────────────────
export async function fetchRecord(
  tableName: TableName,
  recordId: string,
  db?: SqlLike,
): Promise<Row> {
  const sql = db ?? getSql();
  const softDeleteClause = SOFT_DELETE_TABLES.has(tableName)
    ? ` AND ${quoteIdent(tableName)}."deleted_at" IS NULL`
    : '';
  const rows = (await sql.query(
    `SELECT * FROM ${quoteIdent(tableName)} WHERE id = $1${softDeleteClause} LIMIT 1`,
    [recordId]
  )) as Row[];
  if (!rows.length) throw new Error(`Record ${recordId} not found in ${tableName}`);
  return rows[0];
}

// ── create record ────────────────────────────────────────────
export async function createRecord(
  tableName: TableName,
  fields: Record<string, unknown>,
  actor?: string
): Promise<Row> {
  const sql = getSql();

  // Skip undefined values (treated as "not set", like Airtable)
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);

  let rows: Row[];
  if (entries.length === 0) {
    // Empty insert — let all columns take their defaults (id is generated)
    rows = (await sql.query(
      `INSERT INTO ${quoteIdent(tableName)} DEFAULT VALUES RETURNING *`,
      []
    )) as Row[];
  } else {
    const cols = entries.map(([k]) => quoteIdent(k)).join(', ');
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);

    rows = (await sql.query(
      `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    )) as Row[];
  }

  if (actor && rows[0]?.id) {
    await logAuditTrail({ actor, tableName, recordId: rows[0].id, action: 'INSERT' });
  }
  return rows[0];
}

// ── update record ────────────────────────────────────────────
export async function updateRecord(
  tableName: TableName,
  recordId: string,
  fields: Record<string, unknown>,
  actor?: string
): Promise<Row> {
  const sql = getSql();

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return fetchRecord(tableName, recordId);

  // Snapshot before-update values for the fields we're about to change
  let oldValues: Record<string, unknown> = {};
  if (actor) {
    const old = (await sql.query(
      `SELECT ${entries.map(([k], i) => `${quoteIdent(k)} AS col${i}`).join(', ')} FROM ${quoteIdent(tableName)} WHERE id = $1`,
      [recordId]
    )) as Row[];
    oldValues = old[0] ?? {};
  }

  const setClause = entries
    .map(([k], i) => `${quoteIdent(k)} = $${i + 1}`)
    .join(', ');
  const values = entries.map(([, v]) => v);
  values.push(recordId);

  const rows = (await sql.query(
    `UPDATE ${quoteIdent(tableName)} SET ${setClause} WHERE id = $${values.length} RETURNING *`,
    values
  )) as Row[];
  if (!rows.length) throw new Error(`Record ${recordId} not found in ${tableName}`);

  // Compute changed fields diff and log
  if (actor) {
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of entries) {
      const oldVal = oldValues[`col${entries.findIndex(([ek]) => ek === k)}`] ?? null;
      const newVal = v ?? null;
      // Only record changes where before != after (compare via JSON for objects)
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[k] = { from: oldVal, to: newVal };
      }
    }
    if (Object.keys(changedFields).length > 0) {
      await logAuditTrail({ actor, tableName, recordId, action: 'UPDATE', changedFields });
    }
  }

  return rows[0];
}

// ── batch create (transactional) ─────────────────────────────
// Wraps all inserts in a single transaction — if any insert fails, the
// entire batch rolls back. Prevents orphaned partial-write states.
// Pass { inTransaction: true } when the caller already holds a BEGIN.
export async function batchCreate(
  tableName: TableName,
  recordsData: Record<string, unknown>[],
  opts?: { inTransaction?: boolean }
): Promise<Row[]> {
  if (recordsData.length === 0) return [];

  const sql = getSql();
  const results: Row[] = [];
  const ownTx = !opts?.inTransaction;

  if (ownTx) await sql.query('BEGIN');
  try {
    for (const fields of recordsData) {
      const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
      if (entries.length === 0) {
        const rows = (await sql.query(
          `INSERT INTO ${quoteIdent(tableName)} DEFAULT VALUES RETURNING *`, []
        )) as Row[];
        results.push(rows[0]);
      } else {
        const cols = entries.map(([k]) => quoteIdent(k)).join(', ');
        const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
        const values = entries.map(([, v]) => v);
        const rows = (await sql.query(
          `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders}) RETURNING *`,
          values
        )) as Row[];
        results.push(rows[0]);
      }
    }
    if (ownTx) await sql.query('COMMIT');
  } catch (err) {
    if (ownTx) await sql.query('ROLLBACK');
    throw err;
  }

  return results;
}

// ── safe field-level lookup (bypasses formula translator) ────
// Use this instead of filterByFormula when the lookup value comes
// from external input (invoice numbers, tracking numbers, etc.).
export async function findByField(
  tableName: TableName,
  field: string,
  value: string,
  limit = 1,
  db?: SqlLike,
): Promise<Row[]> {
  const sql = db ?? getSql();
  const softDeleteClause = SOFT_DELETE_TABLES.has(tableName)
    ? ` AND ${quoteIdent(tableName)}."deleted_at" IS NULL`
    : '';
  const rows = (await sql.query(
    `SELECT * FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(field)} = $1${softDeleteClause} LIMIT $2`,
    [value, limit]
  )) as Row[];
  return rows;
}

// ── Soft delete ────────────────────────────────────────────────
export async function softDelete(tableName: TableName, recordId: string, actor?: string): Promise<Row | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `UPDATE ${quoteIdent(tableName)}
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [recordId]
  )) as Row[];
  if (rows[0] && actor) {
    await logAuditTrail({ actor, tableName, recordId, action: 'DELETE' });
  }
  return rows[0] ?? null;
}

export async function restoreRecord(tableName: TableName, recordId: string): Promise<Row | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `UPDATE ${quoteIdent(tableName)}
     SET deleted_at = NULL
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING *`,
    [recordId]
  )) as Row[];
  return rows[0] ?? null;
}

// ── Audit trail ─────────────────────────────────────────────────
// Logs every INSERT / UPDATE / DELETE to audit_trail. Called internally by
// createRecord / updateRecord / softDelete when an actor is provided.
interface AuditEntry {
  actor?: string;
  tableName: string;
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changedFields?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

export async function logAuditTrail(entry: AuditEntry): Promise<void> {
  const sql = getSql();
  await sql.query(
    `INSERT INTO audit_trail (id, actor, table_name, record_id, action, changed_fields, changed_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), $7::jsonb)`,
    [
      `at${crypto.randomUUID().replaceAll('-', '')}`,
      entry.actor ?? null,
      entry.tableName,
      entry.recordId,
      entry.action,
      entry.changedFields ? JSON.stringify(entry.changedFields) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
}
