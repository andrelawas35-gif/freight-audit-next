/**
 * db.ts — Self-contained Neon Postgres connection for the Gateway service.
 *
 * Separate from the Next.js app's lib/db.ts — the Gateway is an independent
 * service with its own dependency tree (npm workspace under services/gateway/).
 *
 * Uses the HTTP driver (neon()) for the initial cache load and buffer drain.
 * The Gateway connects as neondb_owner since it needs cross-tenant read access
 * for ruleset loading and RLS-bypassed writes for the decision log.
 */

import { neon, types } from '@neondatabase/serverless';

// Postgres returns numeric/bigint as strings; coerce to JS numbers.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  _sql = neon(url);
  return _sql;
}

export { neon, types };
