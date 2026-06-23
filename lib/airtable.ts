/*
  lib/airtable.ts — data-access layer.

  NOTE: Despite the filename, this is now backed by Neon Postgres, not Airtable.
  The exported API (fetchRecords / fetchRecord / createRecord / updateRecord /
  batchCreate) and the record shape ({ id, ...fields }) are unchanged, so every
  caller keeps working without edits. The filename is kept to avoid touching the
  ~15 files that import from '@/lib/airtable'.

  Each Postgres table uses quoted column names that exactly match the old
  Airtable field names (e.g. "Invoice number"), so `SELECT *` returns rows
  already keyed the way the app expects. Link/relationship fields are stored as
  text[] arrays of record ids, mirroring Airtable's linked-record arrays.

  Runs on the SERVER only. DATABASE_URL lives in .env.local.

  Usage in any page (unchanged):
    import { fetchRecords } from '@/lib/airtable';
    const disputes = await fetchRecords('Disputes', { filterByFormula: `{Status} = 'Open'` });
*/

import { getSql } from '@/lib/db';

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
  | 'DAS Zip Codes';

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
//   FIND("rec123", ARRAYJOIN({Link})) → $n = ANY("Link")
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

  // FIND("value", ARRAYJOIN({Field}))  → membership test on a text[] column
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
  const eq = /^\{([\s\S]+?)\}\s*=\s*["']([\s\S]*)["']$/i.exec(f);
  if (eq) {
    const field = eq[1];
    const value = eq[2];
    params.push(value);
    return `${quoteIdent(field)} = $${params.length}`;
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
export async function fetchRecords(
  tableName: TableName,
  options: RecordQueryOptions = {}
): Promise<Row[]> {
  const sql = getSql();
  const params: unknown[] = [];

  let query = `SELECT * FROM ${quoteIdent(tableName)}`;

  if (options.filterByFormula && options.filterByFormula.trim()) {
    query += ` WHERE ${translateFormula(options.filterByFormula, params)}`;
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
  } = {}
): Promise<Row[]> {
  const sql = getSql();
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
  chunkSize = DEFAULT_PAGE_SIZE
): Promise<Row[]> {
  const sql = getSql();
  const size = positiveInteger(chunkSize, 'chunkSize');
  const uniqueIds = [...new Set(recordIds.filter(Boolean))];
  const rows: Row[] = [];

  for (let i = 0; i < uniqueIds.length; i += size) {
    const chunk = uniqueIds.slice(i, i + size);
    const page = (await sql.query(
      `SELECT * FROM ${quoteIdent(tableName)} WHERE id = ANY($1::text[]) ORDER BY id ASC`,
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
  chunkSize = DEFAULT_PAGE_SIZE
): Promise<Row[]> {
  const sql = getSql();
  const size = positiveInteger(chunkSize, 'chunkSize');
  const uniqueIds = [...new Set(linkedIds.filter(Boolean))];
  const byId = new Map<string, Row>();

  for (let i = 0; i < uniqueIds.length; i += size) {
    const chunk = uniqueIds.slice(i, i + size);
    const page = (await sql.query(
      `SELECT * FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(linkField)} && $1::text[] ORDER BY id ASC`,
      [chunk]
    )) as Row[];
    for (const row of page) byId.set(row.id, row);
  }

  return [...byId.values()];
}

// ── read one record ──────────────────────────────────────────
export async function fetchRecord(tableName: TableName, recordId: string): Promise<Row> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT * FROM ${quoteIdent(tableName)} WHERE id = $1 LIMIT 1`,
    [recordId]
  )) as Row[];
  if (!rows.length) throw new Error(`Record ${recordId} not found in ${tableName}`);
  return rows[0];
}

// ── create record ────────────────────────────────────────────
export async function createRecord(
  tableName: TableName,
  fields: Record<string, unknown>
): Promise<Row> {
  const sql = getSql();

  // Skip undefined values (treated as "not set", like Airtable)
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);

  if (entries.length === 0) {
    // Empty insert — let all columns take their defaults (id is generated)
    const rows = (await sql.query(
      `INSERT INTO ${quoteIdent(tableName)} DEFAULT VALUES RETURNING *`,
      []
    )) as Row[];
    return rows[0];
  }

  const cols = entries.map(([k]) => quoteIdent(k)).join(', ');
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);

  const rows = (await sql.query(
    `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values
  )) as Row[];
  return rows[0];
}

// ── update record ────────────────────────────────────────────
export async function updateRecord(
  tableName: TableName,
  recordId: string,
  fields: Record<string, unknown>
): Promise<Row> {
  const sql = getSql();

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return fetchRecord(tableName, recordId);

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
  limit = 1
): Promise<Row[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT * FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(field)} = $1 LIMIT $2`,
    [value, limit]
  )) as Row[];
  return rows;
}
