/*
  lib/ingestion/mappings.ts — Human-in-the-Loop code mapping (Phase 1).

  Resolution order for a raw carrier code:
    learned_mappings (DB, human/AI authored)  →  baseline hardcoded map  →  unknown

  On "unknown", the resolver collects an exception draft (deduped) instead of
  silently bucketing to OTHER. The ingest route persists these so an analyst can
  map them once — after which the DB layer handles that code automatically.

  This mirrors the rulebook pattern: reference data the pipeline reads, not logic
  buried in code.
*/

import { neon, types } from '@neondatabase/serverless';
import { baselineAccessorial } from './accessorial-map';
import { baselineServiceLevel } from './service-level-map';

types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

export type MappingType = 'accessorial' | 'service_level';

export type LearnedMapping = {
  id: string;
  mapping_type: MappingType;
  carrier_scac: string | null;
  raw_code: string;
  standard_code: string;
  author: string;
  confidence: number | null;
  created_at: string;
};

export type ExceptionDraft = {
  mappingType: MappingType;
  carrierScac: string | null;
  rawCode: string;
  source: string;
  sample?: Record<string, unknown> | null;
};

// What the carrier/client adapters use during normalization.
export type MappingContext = {
  accessorial: (scac: string, rawCode: string) => string;
  serviceLevel: (scac: string, rawCode: string) => string;
  readonly exceptions: ExceptionDraft[];
};

function key(type: string, scac: string | null, raw: string) {
  return `${type}|${(scac || '').toUpperCase()}|${raw.toUpperCase()}`;
}

export async function loadLearnedMappings(): Promise<LearnedMapping[]> {
  const sql = getSql();
  return (await sql.query('SELECT * FROM learned_mappings')) as LearnedMapping[];
}

// Build a resolver backed by learned mappings. `source` tags any exceptions
// raised (e.g. 'csv', 'edi', 'api').
export function createMappingContext(
  rows: LearnedMapping[],
  source: string
): MappingContext {
  const index = new Map<string, string>();
  for (const r of rows) {
    // carrier-specific first, then a cross-carrier (null scac) fallback key
    index.set(key(r.mapping_type, r.carrier_scac, r.raw_code), r.standard_code);
  }

  const exceptions: ExceptionDraft[] = [];
  const seen = new Set<string>();

  function raise(type: MappingType, scac: string, raw: string) {
    const k = key(type, scac, raw);
    if (seen.has(k)) return;
    seen.add(k);
    exceptions.push({ mappingType: type, carrierScac: scac || null, rawCode: raw, source });
  }

  function learned(type: MappingType, scac: string, raw: string): string | undefined {
    return (
      index.get(key(type, scac, raw)) ??       // carrier-specific
      index.get(key(type, null, raw))          // cross-carrier
    );
  }

  return {
    exceptions,
    accessorial(scac, raw) {
      if (!raw) return 'OTHER';
      const hit = learned('accessorial', scac, raw);
      if (hit) return hit;
      const base = baselineAccessorial(scac, raw);
      if (base.matched) return base.code;
      raise('accessorial', scac, raw);
      return base.code; // 'OTHER' — still ingests, just flagged
    },
    serviceLevel(scac, raw) {
      if (!raw) return raw;
      const hit = learned('service_level', scac, raw);
      if (hit) return hit;
      const base = baselineServiceLevel(scac, raw);
      if (base.matched) return base.value;
      raise('service_level', scac, raw);
      return base.value; // raw passthrough — flagged
    },
  };
}

// A baseline-only context (no DB, no exception capture) — used when an adapter
// is called outside an ingest run.
export function baselineMappingContext(): MappingContext {
  return {
    exceptions: [],
    accessorial: (scac, raw) => baselineAccessorial(scac, raw).code,
    serviceLevel: (scac, raw) => baselineServiceLevel(scac, raw).value,
  };
}

// Persist collected exceptions, deduping against existing OPEN rows
// (increments an occurrence counter instead of piling up duplicates).
export async function persistExceptions(drafts: ExceptionDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const sql = getSql();
  let written = 0;
  for (const d of drafts) {
    const existing = (await sql.query(
      `SELECT id FROM ingestion_exceptions
        WHERE status='open' AND mapping_type=$1
          AND coalesce(carrier_scac,'')=coalesce($2,'')
          AND upper(raw_code)=upper($3)
        LIMIT 1`,
      [d.mappingType, d.carrierScac, d.rawCode]
    )) as { id: string }[];

    if (existing.length) {
      await sql.query(
        'UPDATE ingestion_exceptions SET occurrences = occurrences + 1 WHERE id = $1',
        [existing[0].id]
      );
    } else {
      await sql.query(
        `INSERT INTO ingestion_exceptions (mapping_type, carrier_scac, raw_code, source, sample)
         VALUES ($1,$2,$3,$4,$5)`,
        [d.mappingType, d.carrierScac, d.rawCode, d.source, d.sample ? JSON.stringify(d.sample) : null]
      );
      written++;
    }
  }
  return written;
}

// ── analyst console CRUD ─────────────────────────────────────
export type ExceptionRow = {
  id: string;
  mapping_type: MappingType;
  carrier_scac: string | null;
  raw_code: string;
  source: string | null;
  suggested_code: string | null;
  suggested_confidence: number | null;
  reasoning: string | null;
  occurrences: number;
  status: string;
  created_at: string;
};

export async function listExceptions(status = 'open', limit = 200): Promise<ExceptionRow[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM ingestion_exceptions WHERE status = $1 ORDER BY occurrences DESC, created_at DESC LIMIT $2',
    [status, limit]
  )) as ExceptionRow[];
}

// The HITL commit: write the learned mapping AND clear the exception.
export async function resolveException(
  exceptionId: string,
  standardCode: string,
  resolvedBy: string,
  author = 'HUMAN_ANALYST'
): Promise<void> {
  const sql = getSql();
  const rows = (await sql.query('SELECT * FROM ingestion_exceptions WHERE id = $1', [exceptionId])) as ExceptionRow[];
  const exc = rows[0];
  if (!exc) throw new Error('Exception not found');

  // upsert the learned mapping
  const existing = (await sql.query(
    `SELECT id FROM learned_mappings
      WHERE mapping_type=$1 AND coalesce(carrier_scac,'')=coalesce($2,'') AND upper(raw_code)=upper($3)
      LIMIT 1`,
    [exc.mapping_type, exc.carrier_scac, exc.raw_code]
  )) as { id: string }[];

  let mappingId: string;
  if (existing.length) {
    await sql.query(
      'UPDATE learned_mappings SET standard_code=$2, author=$3, updated_at=now() WHERE id=$1',
      [existing[0].id, standardCode, author]
    );
    mappingId = existing[0].id;
  } else {
    const ins = (await sql.query(
      `INSERT INTO learned_mappings (mapping_type, carrier_scac, raw_code, standard_code, author)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [exc.mapping_type, exc.carrier_scac, exc.raw_code, standardCode, author]
    )) as { id: string }[];
    mappingId = ins[0].id;
  }

  await sql.query(
    `UPDATE ingestion_exceptions
        SET status='resolved', resolved_by=$2, resolved_at=now(), learned_mapping_id=$3
      WHERE id=$1`,
    [exceptionId, resolvedBy, mappingId]
  );
}

// Store an AI Data Clerk suggestion on an exception (suggest-only; not committed).
export async function setExceptionSuggestion(
  exceptionId: string,
  suggestedCode: string,
  reasoning: string,
  confidence: number
): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE ingestion_exceptions
        SET suggested_code = $2, reasoning = $3, suggested_confidence = $4
      WHERE id = $1`,
    [exceptionId, suggestedCode, reasoning, confidence]
  );
}

export async function dismissException(exceptionId: string, by: string): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE ingestion_exceptions SET status='dismissed', resolved_by=$2, resolved_at=now() WHERE id=$1`,
    [exceptionId, by]
  );
}
