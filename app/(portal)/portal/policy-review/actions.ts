'use server';

/**
 * T4 Client Ambiguity Dashboard — server actions (ADR 0012 D5)
 *
 * Three actions for client decisions on unmappable clauses:
 *   defineClause  — client provides operational definition; creates draft rule
 *   excludeClause — client chooses not to enforce; creates scope exclusion record
 *   flagClause    — client routes to staff for further review
 *
 * All actions are client-scoped via session.user.clientId.
 */

import { auth } from '@/auth';
import crypto from 'node:crypto';
import { getSql } from '@/lib/db';
import { findOrCreateClientDraftRuleset } from '@/lib/intelligence/policy-service';
import { revalidatePath } from 'next/cache';

// ── Types ───────────────────────────────────────────────────────────

export interface DefineClauseInput {
  scopeExclusionId: string;
  clauseText: string;
  ruleKey: string;
  conditionJson: Record<string, unknown>;
  reasoning?: string;
}

export interface ExcludeClauseInput {
  scopeExclusionId: string;
  reason: string;
}

export interface FlagClauseInput {
  scopeExclusionId: string;
  note?: string;
}

export type T4ActionResult = {
  success: true;
  message: string;
} | {
  success: false;
  error: string;
};

// ── Helpers ──────────────────────────────────────────────────────────

async function getClientId(): Promise<string> {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) throw new Error('Not authorized — no client scope.');
  return clientId;
}

async function getUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authorized — no user session.');
  return userId;
}

// ── Actions ──────────────────────────────────────────────────────────

/**
 * Define: Client provides an operational definition for an unmapped clause.
 * Creates a draft policy rule with signal_source='CLIENT_DEFINED'.
 * Updates the scope exclusion record to status='defined'.
 */
export async function defineClauseAction(input: DefineClauseInput): Promise<T4ActionResult> {
  try {
    const clientId = await getClientId();
    const sql = await getSql();

    // Validate the condition keys are known PolicyCondition fields
    const VALID_KEYS = new Set([
      'declaredValueGte', 'declaredValueGt', 'declaredValueLte',
      'insuredValueLtDeclared', 'carrierIn', 'carrierNotIn',
      'serviceIn', 'serviceNotIn', 'shipperVertical', 'commodityType',
      'commodityIn', 'destinationCountryIn', 'destinationZipIn',
      'destinationRiskTierIn', 'signatureRequiredAbove', 'signatureTypeIn',
      'documentationRequired', 'packageTypeIn', 'temperatureControlRequired',
      'temperatureMax',
    ]);
    for (const key of Object.keys(input.conditionJson)) {
      if (!VALID_KEYS.has(key)) {
        return { success: false, error: `Unknown condition key: "${key}".` };
      }
    }

    // Find or create the per-client draft ruleset BEFORE the transaction.
    // This is idempotent (finds existing or creates new + copies forward) and
    // safe to commit immediately — it runs on its own connection(s) via getSql().
    // The UPDATE + INSERT below are the atomic pair; if either fails, the
    // already-committed ruleset is harmless (an empty draft with no rules).
    const rulesetId = await findOrCreateClientDraftRuleset(clientId);

    // Pre-check: scope exclusion must exist in pending_review state.
    // We check BEFORE the transaction because sql.transaction() cannot do
    // conditional branching — all queries are pre-computed.
    const preCheck = await sql.query(
      `SELECT id FROM policy_scope_exclusions WHERE id = $1 AND client_id = $2 AND status = 'pending_review'`,
      [input.scopeExclusionId, clientId]
    ) as Record<string, unknown>[];
    if (preCheck.length === 0) {
      return { success: false, error: 'Scope exclusion not found or already processed.' };
    }

    // Generate rule ID outside the transaction so it's deterministic.
    const ruleId = 'pr' + crypto.randomUUID().replace(/-/g, '');

    // Atomic transaction: UPDATE scope exclusion + INSERT policy rule.
    // Uses sql.transaction() (Neon documented API) instead of raw BEGIN/COMMIT
    // (CLAUDE.md invariant #3). If either statement fails, both roll back.
    const conditionJson = JSON.stringify(input.conditionJson);
    const actionJson = JSON.stringify({
      action: 'WARN',
      message: `Client-defined rule: ${input.reasoning || input.ruleKey}`,
    });

    await sql.transaction((txn) => [
      txn.query(
        `UPDATE policy_scope_exclusions
         SET status = 'defined',
             exclusion_type = 'define',
             rule_key = $2,
             condition_json = $3::jsonb,
             reason = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [input.scopeExclusionId, input.ruleKey, conditionJson, input.reasoning || null]
      ),
      txn.query(
        `INSERT INTO policy_rules (
           id, client_id, ruleset_id, policy_id,
           rule_key, category, condition_json, action_json,
           severity, clause_ref, status, signal_source,
           source_clause_text, confidence
         ) VALUES (
           $1, $2, $3, NULL,
           $4, 'client_defined', $5::jsonb, $6::jsonb,
           'warn', NULL, 'draft', 'CLIENT_DEFINED',
           $7, 0.85
         )`,
        [ruleId, clientId, rulesetId, input.ruleKey, conditionJson, actionJson, input.clauseText]
      ),
    ]);

    revalidatePath('/portal/policy-review');
    return { success: true, message: `Rule "${input.ruleKey}" created as draft. Staff will review and activate.` };
  } catch (err) {
    console.error('[T4 defineClause]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create rule.' };
  }
}

/**
 * Exclude: Client explicitly chooses NOT to enforce this clause.
 * Creates a binding governance record — this is the client's decision, not a platform oversight.
 */
export async function excludeClauseAction(input: ExcludeClauseInput): Promise<T4ActionResult> {
  try {
    const clientId = await getClientId();
    const userId = await getUserId();
    const sql = await getSql();

    const result = await sql.query(`
      UPDATE policy_scope_exclusions
      SET status = 'excluded',
          exclusion_type = 'exclude',
          reason = $2,
          excluded_by = $3,
          excluded_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND client_id = $4 AND status = 'pending_review'
      RETURNING id
    `, [input.scopeExclusionId, input.reason, userId, clientId]);

    if (!result || (result as any[]).length === 0) {
      return { success: false, error: 'Scope exclusion not found or already processed.' };
    }

    revalidatePath('/portal/policy-review');
    return { success: true, message: 'Clause excluded. This decision is recorded in your compliance record.' };
  } catch (err) {
    console.error('[T4 excludeClause]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to exclude clause.' };
  }
}

/**
 * Flag: Client requests staff review of an ambiguous clause.
 * Marks the exclusion record for staff attention in the console.
 */
export async function flagClauseAction(input: FlagClauseInput): Promise<T4ActionResult> {
  try {
    const clientId = await getClientId();
    const userId = await getUserId();
    const sql = await getSql();

    // Status stays 'pending_review' (compatible with migration 0016 CHECK constraint).
    // flagged_at / flagged_by record that the client requested staff attention.
    // Staff filter: WHERE flagged_at IS NOT NULL AND status = 'pending_review'.
    const result = await sql.query(`
      UPDATE policy_scope_exclusions
      SET status = 'pending_review',
          exclusion_type = 'flag',
          reason = $2,
          excluded_by = $3,
          flagged_at = NOW(),
          flagged_by = $3,
          updated_at = NOW()
      WHERE id = $1 AND client_id = $4 AND status = 'pending_review'
      RETURNING id
    `, [input.scopeExclusionId, input.note || null, userId, clientId]);

    if (!result || (result as any[]).length === 0) {
      return { success: false, error: 'Scope exclusion not found or already processed.' };
    }

    revalidatePath('/portal/policy-review');
    return { success: true, message: 'Clause flagged for staff review. An Aurelian analyst will follow up.' };
  } catch (err) {
    console.error('[T4 flagClause]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to flag clause.' };
  }
}
