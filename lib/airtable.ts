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

import { neon, types } from '@neondatabase/serverless';

// Postgres returns numeric/bigint as strings to preserve precision, but the
// app (and the old Airtable layer) expect JS numbers for arithmetic. Coerce
// numeric (OID 1700) and bigint (OID 20) back to numbers globally.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// ── connect ──────────────────────────────────────────────────
let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

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

// ── filterByFormula → SQL WHERE translator ───────────────────
// Supports exactly the Airtable formula shapes this codebase uses:
//   {Field} = 'value'           → "Field" = $n
//   {Field} = "value"           → "Field" = $n
//   RECORD_ID() = "rec123"      → id = $n
//   OR(expr, expr, ...)         → (expr OR expr ...)
//   AND(expr, expr, ...)        → (expr AND expr ...)
//   FIND("rec123", ARRAYJOIN({Link})) → $n = ANY("Link")
// Throws on anything unrecognized so we never silently return wrong data.
function translateFormula(
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
function splitTopLevel(s: string): string[] {
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
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── read records ─────────────────────────────────────────────
// Returns a flat array of { id, ...fields } objects — same shape as before.
export async function fetchRecords(
  tableName: TableName,
  options: {
    filterByFormula?: string;
    sort?: { field: string; direction?: 'asc' | 'desc' }[];
    maxRecords?: number;
    fields?: string[];   // accepted for compatibility; we always SELECT *
    view?: string;       // accepted for compatibility; ignored
  } = {}
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

  const limit = options.maxRecords ?? 100;
  query += ` LIMIT ${Number(limit)}`;

  const rows = (await sql.query(query, params)) as Row[];
  return rows;
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

// ── batch create ─────────────────────────────────────────────
// Airtable capped at 10/call; Postgres has no such limit, but we keep the
// same signature and return shape. Inserts run sequentially for simplicity.
export async function batchCreate(
  tableName: TableName,
  recordsData: Record<string, unknown>[]
): Promise<Row[]> {
  const results: Row[] = [];
  for (const fields of recordsData) {
    results.push(await createRecord(tableName, fields));
  }
  return results;
}
