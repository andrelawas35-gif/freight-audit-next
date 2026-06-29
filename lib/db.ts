/*
  lib/db.ts — shared Neon Postgres connections.

  Two connection paths (CONTRACTS.md §5, data-protection.md D2):

  1. getSql() — HTTP driver (neon()), connects as neondb_owner.
     For staff/console/aggregate BI work that legitimately reads
     across tenants. RLS does NOT apply to the table owner.

  2. getTenantSql(clientId) — Pooled wire connection (Pool),
     connects as the restricted app_tenant role. Sets
     app.current_tenant per checkout so RLS policies are active.
     For Tier-2 protected reads (Invoices, Audit Results, Disputes,
     client_policies, policy_rules, gateway_decisions, etc.).

  Every module that needs the database imports from here.
  Replaces the 8 separate getSql() singletons that were scattered
  across lib/airtable.ts, lib/users.ts, lib/audit/rulebook.ts, etc.
*/

import { neon, types, Pool } from '@neondatabase/serverless';

// Postgres returns numeric/bigint as strings; coerce to JS numbers.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// ── HTTP driver (staff/aggregates, no RLS) ──────────────────────────

let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL in .env.local');
  _sql = neon(url);
  return _sql;
}

export { getSql as sql };

// ── Pooled restricted-role connection (Tier-2 RLS-protected reads) ──

let _tenantPool: Pool | null = null;

/**
 * Returns a pooled client connected as the restricted `app_tenant` role.
 *
 * Caller MUST:
 *   1. `const client = await getTenantSql(clientId);`
 *   2. Run queries (app.current_tenant is already SET for this checkout)
 *   3. `client.release();` when done
 *
 * The pooled connection keeps SET app.current_tenant persistent for the
 * life of the checkout — unlike the HTTP driver where each sql`...` is
 * an independent request with no session continuity.
 *
 * RLS policies (FORCE ROW LEVEL SECURITY on all Phase-1 tables) ensure
 * the clientId from auth/API-key is enforced at the database engine,
 * not just in application WHERE clauses (data-protection.md D2).
 *
 * For staff/aggregate/BI work that reads across tenants, use getSql()
 * (HTTP driver, table owner role, RLS bypassed).
 *
 * Pool configuration:
 *   TENANT_DATABASE_URL — optional pooled-endpoint override (defaults to DATABASE_URL).
 *     Set to the Neon -pooler host when adopting session-mode pooling.
 *   TENANT_POOL_MAX — max connections per instance (default 10, matches neon Pool default).
 */
export async function getTenantSql(clientId: string) {
  if (!_tenantPool) {
    const url = process.env.TENANT_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('Missing DATABASE_URL in .env.local');
    const max = parseInt(process.env.TENANT_POOL_MAX || '10', 10);
    _tenantPool = new Pool({ connectionString: url, max });
  }
  const client = await _tenantPool.connect();
  // Reset role and tenant first — pooled connections reuse sessions
  // and a previous checkout may have left stale SET ROLE or SET app.current_tenant.
  // Batched into a single multi-statement query (was 4 round-trips; now 1).
  await client.query(`
    RESET ROLE;
    RESET app.current_tenant;
    SET ROLE app_tenant;
    SET app.current_tenant = $1;
  `, [clientId]);
  return client;
}

// Re-export for callers that need the neon function directly (e.g. transactions).
export { neon, types, Pool } from '@neondatabase/serverless';
