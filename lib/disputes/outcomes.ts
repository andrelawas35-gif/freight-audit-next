/*
  lib/disputes/outcomes.ts — the dispute-outcome label store (learning signal).

  Every confirmed carrier outcome is recorded here. This is the ground-truth
  feedback the system can later use to score which rules/mappings actually
  recover money (the outcome-feedback loop).
*/

import { getSql } from '@/lib/db';

export async function recordOutcomeLabel(input: {
  disputeId: string;
  outcome: string;
  recoveryAmount: number | null;
  confidence: number | null;
  reasoning: string | null;
  sourceText: string | null;
  appliedBy: string | null;
  ruleCode?: string | null;       // the rule that originated the finding
  carrierScac?: string | null;
  disputedAmount?: number | null;
}): Promise<void> {
  const sql = getSql();
  await sql.query(
    `INSERT INTO dispute_outcomes
       (dispute_id, outcome, recovery_amount, confidence, reasoning, source_text, applied_by,
        rule_code, carrier_scac, disputed_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.disputeId,
      input.outcome,
      input.recoveryAmount,
      input.confidence,
      input.reasoning,
      input.sourceText ? input.sourceText.slice(0, 4000) : null,
      input.appliedBy,
      input.ruleCode ?? null,
      input.carrierScac ?? null,
      input.disputedAmount ?? null,
    ]
  );
}

// ── Step 2: per-rule performance from real carrier outcomes ──────
export type RuleStat = {
  rule_code: string;
  won: number;        // won + partial
  denied: number;
  escalated: number;
  total: number;
  recovered: number;  // $ from won/partial
  denied_amount: number; // $ at stake on denied claims
  win_rate: number;   // won / (won + denied), 0..1
};

export async function getRuleOutcomeStats(): Promise<RuleStat[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT
        rule_code,
        count(*) FILTER (WHERE outcome IN ('won','partial'))::int AS won,
        count(*) FILTER (WHERE outcome = 'denied')::int           AS denied,
        count(*) FILTER (WHERE outcome = 'escalated')::int        AS escalated,
        count(*)::int                                             AS total,
        coalesce(sum(recovery_amount) FILTER (WHERE outcome IN ('won','partial')),0) AS recovered,
        coalesce(sum(disputed_amount) FILTER (WHERE outcome = 'denied'),0)           AS denied_amount
      FROM dispute_outcomes
      WHERE rule_code IS NOT NULL
      GROUP BY rule_code
      ORDER BY recovered DESC`
  )) as Omit<RuleStat, 'win_rate'>[];

  return rows.map((r) => {
    const resolved = r.won + r.denied;
    return { ...r, win_rate: resolved > 0 ? r.won / resolved : 0 };
  });
}
