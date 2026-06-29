/**
 * Pinned rulebook fixture — self-contained ground truth for suite 1.
 *
 * Seeds rulebook rows at multiple scopes (global + carrier + contract) for
 * every rule_key exercised by Generator B, plus a fallback-baseline subset
 * with NO matching row (so rules fire on hardcoded code defaults).
 *
 * Explicit `effective_from` / `effective_to` dates bracket the seeded ship
 * dates so the resolver's `new Date()` fallback is never taken.
 *
 * Precedence contract (CLAUDE.md inv. #5):
 *   contract (score 30) > carrier (20) > global (10), service-specific +5.
 */

import type { Pool } from '@neondatabase/serverless';

export interface RulebookFixtureRow {
  scope: 'global' | 'carrier' | 'contract';
  clientId: string | null;
  carrierScac: string | null;
  serviceLevel: string | null;
  ruleKey: string;
  numValue: number | null;
  boolValue: boolean | null;
  textValue: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  clauseRef: string | null;
}

/**
 * Build the pinned rulebook fixture.
 *
 * @param clientId The client record id (used for contract-scope rows).
 * @param carrierScac The carrier SCAC (used for carrier + contract rows).
 */
export function buildRulebookFixture(
  clientId: string,
  carrierScac: string,
): RulebookFixtureRow[] {
  const rows: RulebookFixtureRow[] = [];

  const add = (r: RulebookFixtureRow) => rows.push(r);

  // ── dim_divisor (global + carrier) ────────────────────────────
  // DIM_WEIGHT_TRAP uses this. Set a low dim divisor so anomalies trigger.
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'dim_divisor', numValue: 139, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });
  add({
    scope: 'carrier', clientId: null, carrierScac, serviceLevel: null,
    ruleKey: 'dim_divisor', numValue: 139, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  // ── dim_threshold (global) — minimum overcharge to flag ───────
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'dim_threshold', numValue: 0.50, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  // ── phantom_accessorial_threshold (global) ────────────────────
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'phantom_accessorial_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  // ── residential_surcharge (contract — waives it) ──────────────
  // This is important: the PHANTOM_ACCESSORIAL anomaly plants a commercial
  // address with a residential surcharge. The contract rule waives it.
  add({
    scope: 'contract', clientId, carrierScac, serviceLevel: null,
    ruleKey: 'residential_surcharge', numValue: 0, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
    clauseRef: 'MSA Exhibit B §3.1 — residential surcharge waived for all shipments',
  });

  // ── duplicate_tracking_threshold (global) ─────────────────────
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'duplicate_tracking_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  // ── SLA guarantees ────────────────────────────────────────────
  // Ground → 5 business days, 2nd Day Air → 3 calendar days
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'sla_days', numValue: 7, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });
  add({
    scope: 'carrier', clientId: null, carrierScac, serviceLevel: '2nd Day Air',
    ruleKey: 'sla_days', numValue: 3, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
    clauseRef: 'Carrier service guide §2.1 — 2nd Day Air: 3-day delivery guarantee',
  });

  // ── sla_refund_pct (global) ───────────────────────────────────
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'sla_refund_pct', numValue: 50, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  // ── 3PL thresholds ────────────────────────────────────────────
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'tpl_pick_fee_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'tpl_packaging_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'tpl_markup_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });
  add({
    scope: 'global', clientId: null, carrierScac: null, serviceLevel: null,
    ruleKey: 'tpl_storage_threshold', numValue: 0.01, boolValue: null, textValue: null,
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', clauseRef: null,
  });

  return rows;
}

/**
 * Seed the rulebook fixture into the test database.
 * Truncates existing rulebook rows first for isolation.
 */
export async function seedRulebookFixture(
  pool: Pool,
  rows: RulebookFixtureRow[],
): Promise<void> {
  const client = await pool.connect();
  try {
    // Clear any existing rulebook rows
    await client.query('DELETE FROM rulebook');

    for (const r of rows) {
      await client.query(
        `INSERT INTO rulebook
           (scope, client_id, carrier_scac, service_level, rule_key,
            num_value, bool_value, text_value, effective_from, effective_to, clause_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          r.scope, r.clientId, r.carrierScac, r.serviceLevel,
          r.ruleKey, r.numValue, r.boolValue, r.textValue,
          r.effectiveFrom, r.effectiveTo, r.clauseRef,
        ],
      );
    }
  } finally {
    client.release();
  }
}
