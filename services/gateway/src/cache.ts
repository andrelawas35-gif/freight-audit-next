/**
 * cache.ts — Versioned snapshot cache (08-gateway.md D4).
 *
 * On boot: load all active client rulesets into memory.
 *   Map<clientId, { rulesetVersion: string, rules: PolicyRuleForEvaluation[] }>
 *
 * Effective-dated selection per shipment date.
 * TTL + version-stamp invalidation (~60s bound).
 * Zero per-request DB reads.
 *
 * Uses getSql() (HTTP driver, neondb_owner) for the initial load since the
 * Gateway is a trusted internal service that needs cross-tenant ruleset data.
 */

import { getSql } from '../../../lib/db';
import { getConfig } from './config';
import type {
  PolicyRuleForEvaluation,
  PolicyCondition,
  PolicyAction,
} from '../../../lib/intelligence/policy-evaluator';

interface CachedRuleset {
  rulesetVersion: string;
  rules: PolicyRuleForEvaluation[];
  loadedAt: number;
}

interface RulesetRow {
  id: string;
  client_id: string;
  version: string;
  effective_from: string | null;
  effective_to: string | null;
}

interface RuleRow {
  id: string;
  client_id: string;
  ruleset_id: string;
  rule_key: string;
  category: string;
  condition_json: PolicyCondition;
  action_json: PolicyAction;
  severity: string;
  status: string;
  clause_ref: string | null;
}

let cache: Map<string, CachedRuleset> = new Map();
let lastLoadTime = 0;
let loadPromise: Promise<void> | null = null;

export function getCachedRuleset(
  clientId: string,
): CachedRuleset | undefined {
  return cache.get(clientId.toLowerCase());
}

export function getCacheAge(): number {
  return Date.now() - lastLoadTime;
}

/**
 * Warm the cache: load all active rulesets and their rules from Postgres.
 * Filters by effective date range — ruleset is active if its effective window
 * covers "now" (or has no effective bounds).
 */
export async function warmCache(): Promise<void> {
  const { cacheTtlMs } = getConfig();

  // Avoid concurrent warm cycles
  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = doLoad();
  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }

  // Schedule periodic refresh
  setTimeout(() => warmCache(), cacheTtlMs).unref();
}

async function doLoad(): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const newCache = new Map<string, CachedRuleset>();

  // Load active rulesets (effective window covers today), latest first.
  // ORDER BY effective_from DESC ensures the first ruleset per client is the
  // most recently effective one — no lexicographic version comparison needed.
  const rulesetRows = await sql`
    SELECT id, client_id, version, effective_from, effective_to
    FROM policy_rulesets
    WHERE status = 'active'
      AND (effective_from IS NULL OR effective_from <= ${now}::date)
      AND (effective_to IS NULL OR effective_to >= ${now}::date)
    ORDER BY effective_from DESC NULLS LAST, created_at DESC
  `;
  const rulesets = rulesetRows as unknown as RulesetRow[];

  if (rulesets.length === 0) {
    cache = newCache;
    lastLoadTime = Date.now();
    return;
  }

  const rulesetIds = rulesets.map((r) => r.id);

  // Load active rules for these rulesets
  const ruleRows = await sql`
    SELECT id, client_id, ruleset_id, rule_key, category,
           condition_json, action_json, severity, status, clause_ref
    FROM policy_rules
    WHERE ruleset_id = ANY(${rulesetIds}::text[])
      AND status = 'active'
  `;
  const rules = ruleRows as unknown as RuleRow[];

  // Group rules by clientId, picking latest active ruleset per client.
  // Rulesets are already ordered by effective_from DESC, created_at DESC by the query —
  // the first ruleset encountered for a client is the latest effective one.
  const clientRules = new Map<string, { version: string; rules: PolicyRuleForEvaluation[] }>();

  for (const rs of rulesets) {
    // First ruleset wins (already ordered by effective_from DESC in the query)
    if (clientRules.has(rs.client_id)) continue;

    const clientRulesList: PolicyRuleForEvaluation[] = rules
      .filter((r) => r.ruleset_id === rs.id && r.client_id === rs.client_id)
      .map((r) => ({
        id: r.id,
        clientId: r.client_id,
        rulesetId: r.ruleset_id,
        ruleKey: r.rule_key,
        category: r.category,
        conditionJson: r.condition_json,
        actionJson: r.action_json,
        severity: r.severity as PolicyRuleForEvaluation['severity'],
        status: r.status as PolicyRuleForEvaluation['status'],
        clauseRef: r.clause_ref,
      }));

    clientRules.set(rs.client_id, {
      version: rs.version,
      rules: clientRulesList,
    });
  }

  for (const [clientId, { version, rules: clientRuleList }] of clientRules) {
    newCache.set(clientId.toLowerCase(), {
      rulesetVersion: version,
      rules: clientRuleList,
      loadedAt: Date.now(),
    });
  }

  cache = newCache;
  lastLoadTime = Date.now();

  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'gateway cache warmed',
      ts: new Date().toISOString(),
      clientCount: newCache.size,
      ruleCount: [...newCache.values()].reduce((s, v) => s + v.rules.length, 0),
    }),
  );
}

/**
 * Select the ruleset effective for the given shipment date.
 * Currently the cache holds a single latest-active ruleset per client.
 * If an exact date match is needed, this can be extended.
 */
export function selectRulesForShipment(
  clientId: string,
  _shipmentDate?: string,
): { rulesetVersion: string; rules: PolicyRuleForEvaluation[] } | null {
  const cached = cache.get(clientId.toLowerCase());
  if (!cached) return null;
  return {
    rulesetVersion: cached.rulesetVersion,
    rules: cached.rules,
  };
}
