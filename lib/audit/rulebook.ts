/*
  lib/audit/rulebook.ts — the layered carrier/contract rulebook + resolver.

  Resolution precedence (most specific wins):
    client–carrier contract  →  carrier standard  →  global default

  Values are effective-dated: a row only applies if the shipment's ship date
  falls within [effective_from, effective_to] (either bound may be open).

  The engine loads the whole (small) rulebook once per run and builds an
  in-memory resolver, so per-shipment lookups are synchronous and fast.
*/

import { getSql } from '@/lib/db';

export type RulebookRow = {
  id: string;
  scope: 'global' | 'carrier' | 'contract';
  client_id: string | null;
  carrier_scac: string | null;
  service_level: string | null;
  rule_key: string;
  num_value: number | null;
  bool_value: boolean | null;
  text_value: string | null;
  effective_from: string | null;
  effective_to: string | null;
  clause_ref: string | null;   // MSA / contract citation, e.g. "Exhibit A §2.1"
};

export type ResolveOpts = {
  clientId?: string | null;
  scac?: string | null;
  serviceLevel?: string | null;
  shipDate?: string | null;
};

export type Resolver = {
  num: (key: string, opts: ResolveOpts, fallback: number) => number;
  bool: (key: string, opts: ResolveOpts, fallback: boolean) => boolean;
  text: (key: string, opts: ResolveOpts, fallback: string) => string;
  // The MSA/contract citation of the resolved row (for dispute documentation).
  clause: (key: string, opts: ResolveOpts) => string | null;
};

export async function loadRulebook(): Promise<RulebookRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT * FROM rulebook
      ORDER BY rule_key,
        CASE scope WHEN 'global' THEN 0 WHEN 'carrier' THEN 1 ELSE 2 END,
        carrier_scac NULLS FIRST, service_level NULLS FIRST`
  )) as RulebookRow[];
}

export type NewRulebookRow = {
  scope: 'global' | 'carrier' | 'contract';
  clientId?: string | null;
  carrierScac?: string | null;
  serviceLevel?: string | null;
  ruleKey: string;
  numValue?: number | null;
  boolValue?: boolean | null;
  textValue?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  note?: string | null;
  clauseRef?: string | null;
};

export async function createRulebookRow(r: NewRulebookRow): Promise<RulebookRow> {
  const sql = getSql();
  const rows = (await sql.query(
    `INSERT INTO rulebook
       (scope, client_id, carrier_scac, service_level, rule_key,
        num_value, bool_value, text_value, effective_from, effective_to, note, clause_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      r.scope,
      r.clientId ?? null,
      r.carrierScac ?? null,
      r.serviceLevel ?? null,
      r.ruleKey,
      r.numValue ?? null,
      r.boolValue ?? null,
      r.textValue ?? null,
      r.effectiveFrom || null,
      r.effectiveTo || null,
      r.note ?? null,
      r.clauseRef ?? null,
    ]
  )) as RulebookRow[];
  return rows[0];
}

export async function updateRulebookRow(
  id: string,
  patch: {
    numValue?: number | null; boolValue?: boolean | null; textValue?: string | null;
    effectiveFrom?: string | null; effectiveTo?: string | null; clauseRef?: string | null;
  }
): Promise<void> {
  const sql = getSql();
  // clause_ref uses coalesce so passing null preserves the existing citation.
  await sql.query(
    `UPDATE rulebook
        SET num_value = $2, bool_value = $3, text_value = $4,
            effective_from = $5, effective_to = $6, clause_ref = coalesce($7, clause_ref)
      WHERE id = $1`,
    [
      id, patch.numValue ?? null, patch.boolValue ?? null, patch.textValue ?? null,
      patch.effectiveFrom || null, patch.effectiveTo || null, patch.clauseRef ?? null,
    ]
  );
}

export async function deleteRulebookRow(id: string): Promise<void> {
  const sql = getSql();
  await sql.query('DELETE FROM rulebook WHERE id = $1', [id]);
}

export function createResolver(rows: RulebookRow[]): Resolver {
  function pick(key: string, opts: ResolveOpts): RulebookRow | null {
    const date = (opts.shipDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const svc = opts.serviceLevel ?? null;

    let best: RulebookRow | null = null;
    let bestScore = -1;

    for (const r of rows) {
      if (r.rule_key !== key) continue;

      // effective-date window
      if (r.effective_from && r.effective_from > date) continue;
      if (r.effective_to && r.effective_to < date) continue;

      // service-level filter: a service-specific row only applies to that service
      if (r.service_level) {
        if (!svc || r.service_level !== svc) continue;
      }

      // scope precedence + required matches
      let score: number;
      if (r.scope === 'contract') {
        if (!opts.clientId || r.client_id !== opts.clientId) continue;
        if (r.carrier_scac && r.carrier_scac !== opts.scac) continue;
        score = 30;
      } else if (r.scope === 'carrier') {
        if (!opts.scac || r.carrier_scac !== opts.scac) continue;
        score = 20;
      } else {
        score = 10; // global
      }

      // prefer a service-specific match over a generic one within the same scope
      if (r.service_level) score += 5;

      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  return {
    num: (key, opts, fallback) => {
      const r = pick(key, opts);
      return r && r.num_value != null ? r.num_value : fallback;
    },
    bool: (key, opts, fallback) => {
      const r = pick(key, opts);
      return r && r.bool_value != null ? r.bool_value : fallback;
    },
    text: (key, opts, fallback) => {
      const r = pick(key, opts);
      return r && r.text_value != null ? r.text_value : fallback;
    },
    clause: (key, opts) => {
      const r = pick(key, opts);
      return r?.clause_ref ?? null;
    },
  };
}

// A no-op resolver (always returns fallbacks) — handy for tests/fallback paths.
export function emptyResolver(): Resolver {
  return createResolver([]);
}
