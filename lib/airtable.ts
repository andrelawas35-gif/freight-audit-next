/*
  lib/airtable.ts — connection to your Airtable base.

  This file runs on the SERVER only (never sent to the browser).
  Your PAT stays safe — it's in .env.local, which Next.js
  automatically keeps server-side.

  Usage in any page:
    import { fetchRecords, createRecord, updateRecord } from '@/lib/airtable';
    const disputes = await fetchRecords('Disputes', { status: 'Open' });
*/

import Airtable from 'airtable';

// ── connect ──────────────────────────────────────────────────
let _base: ReturnType<InstanceType<typeof Airtable>['base']> | null = null;

function getBase() {
  if (_base) return _base;
  const pat    = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!pat)    throw new Error('Missing AIRTABLE_PAT in .env.local');
  if (!baseId) throw new Error('Missing AIRTABLE_BASE_ID in .env.local');
  _base = new Airtable({ apiKey: pat }).base(baseId);
  return _base;
}

// ── table name shortcuts ─────────────────────────────────────
// Use the exact display names from your Airtable base.
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

// ── read records ─────────────────────────────────────────────
// Returns a flat array of { id, ...fields } objects.
// This is the function you'll use most.
export async function fetchRecords(
  tableName: TableName,
  options: {
    filterByFormula?: string;
    sort?: { field: string; direction?: 'asc' | 'desc' }[];
    maxRecords?: number;
    fields?: string[];
    view?: string;
  } = {}
) {
  const selectOptions: Record<string, unknown> = {
    maxRecords: options.maxRecords || 100,
  };
  if (options.filterByFormula) selectOptions.filterByFormula = options.filterByFormula;
  if (options.sort && options.sort.length) selectOptions.sort = options.sort;
  if (options.fields && options.fields.length) selectOptions.fields = options.fields;
  if (options.view) selectOptions.view = options.view;

  const records = await getBase()(tableName)
    .select(selectOptions as any)
    .all();

  // Flatten from { id, fields: { ... } } to { id, ... }
  // so your components can just use record.status instead of record.fields.status
  return records.map((r) => ({
    id: r.id,
    ...r.fields,
  }));
}

// ── read one record ──────────────────────────────────────────
export async function fetchRecord(tableName: TableName, recordId: string) {
  const r = await getBase()(tableName).find(recordId);
  return { id: r.id, ...r.fields };
}

// ── create record ────────────────────────────────────────────
export async function createRecord(
  tableName: TableName,
  fields: Record<string, unknown>
) {
  const r: any = await getBase()(tableName).create(fields as any);
  return { id: r.id, ...r.fields };
}

// ── update record ────────────────────────────────────────────
export async function updateRecord(
  tableName: TableName,
  recordId: string,
  fields: Record<string, unknown>
) {
  const r = await getBase()(tableName).update(recordId, fields as any);
  return { id: r.id, ...r.fields };
}

// ── batch create (Airtable caps at 10 per call) ──────────────
export async function batchCreate(
  tableName: TableName,
  recordsData: Record<string, unknown>[]
) {
  const results: { id: string; [key: string]: unknown }[] = [];
  for (let i = 0; i < recordsData.length; i += 10) {
    const batch = recordsData.slice(i, i + 10).map((fields) => ({ fields })) as any;
    const created = await getBase()(tableName).create(batch);
    (created as any[]).forEach((r) => results.push({ id: r.id, ...r.fields }));
  }
  return results;
}
