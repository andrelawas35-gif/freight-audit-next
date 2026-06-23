/*
  lib/db.ts — single shared Neon Postgres connection.

  Every module that needs the database imports `sql` from here.
  Replaces the 8 separate getSql() singletons that were scattered
  across lib/airtable.ts, lib/users.ts, lib/audit/rulebook.ts, etc.

  Also exports `transaction()` for multi-statement atomicity —
  uses Neon's HTTP transaction support.
*/

import { neon, neonConfig, types } from '@neondatabase/serverless';

// Postgres returns numeric/bigint as strings; coerce to JS numbers.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

export { getSql as sql };

// Re-export for callers that need the neon function directly (e.g. transactions).
export { neon, types } from '@neondatabase/serverless';
