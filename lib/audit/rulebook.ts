/*
  lib/audit/rulebook.ts — the layered carrier/contract rulebook + resolver.

  Resolution precedence (most specific wins):
    client–carrier contract  →  carrier standard  →  global default

  Values are effective-dated: a row only applies if the shipment's ship date
  falls within [effective_from, effective_to] (either bound may be open).

  The engine loads the whole (small) rulebook once per run and builds an
  in-memory resolver, so per-shipment lookups are synchronous and fast.
*/

import { neon, types } from '@neondatabase/serverless';

types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

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
};

export async function loadRulebook(): Promise<RulebookRow[]> {
  const sql = getSql();
  return (await sql.query('SELECT * FROM rulebook')) as RulebookRow[];
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
  };
}

// A no-op resolver (always returns fallbacks) — handy for tests/fallback paths.
export function emptyResolver(): Resolver {
  return createResolver([]);
}
