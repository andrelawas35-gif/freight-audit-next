'use server';

/**
 * Staff Review Queue — ADR 0015
 *
 * Lists CLIENT_DEFINED policy rules that haven't been staff-reviewed yet.
 * Staff can approve (staff_reviewed = TRUE → rule becomes attestable)
 * or reject (status = 'archived').
 */

import { auth } from '@/auth';
import { getSql } from '@/lib/db';
import { getUnreviewedClientRules } from '@/lib/intelligence/policy-service';
import { revalidatePath } from 'next/cache';

export type ReviewQueueRow = {
  id: string;
  clientId: string;
  clientName: string | null;
  rulesetId: string;
  ruleKey: string;
  category: string;
  conditionJson: Record<string, unknown>;
  actionJson: Record<string, unknown>;
  severity: string;
  clauseRef: string | null;
  sourceClauseText: string | null;
  createdAt: string;
};

export async function getReviewQueue(): Promise<ReviewQueueRow[]> {
  await requireStaff();
  const sql = getSql();

  const rows = await sql.query(`
    SELECT
      pr.id,
      pr.client_id AS "clientId",
      c."Company name" AS "clientName",
      pr.ruleset_id AS "rulesetId",
      pr.rule_key AS "ruleKey",
      pr.category,
      pr.condition_json AS "conditionJson",
      pr.action_json AS "actionJson",
      pr.severity,
      pr.clause_ref AS "clauseRef",
      pr.source_clause_text AS "sourceClauseText",
      pr.created_at AS "createdAt"
    FROM policy_rules pr
    LEFT JOIN "Clients" c ON c.id = pr.client_id
    WHERE pr.signal_source = 'CLIENT_DEFINED'
      AND pr.staff_reviewed = FALSE
      AND pr.deleted_at IS NULL
    ORDER BY pr.created_at ASC
  `) as Record<string, unknown>[];

  return rows.map(r => ({
    id: String(r.id ?? ''),
    clientId: String(r.clientId ?? ''),
    clientName: r.clientName ? String(r.clientName) : null,
    rulesetId: String(r.rulesetId ?? ''),
    ruleKey: String(r.ruleKey ?? ''),
    category: String(r.category ?? ''),
    conditionJson: (r.conditionJson ?? {}) as Record<string, unknown>,
    actionJson: (r.actionJson ?? {}) as Record<string, unknown>,
    severity: String(r.severity ?? 'warn'),
    clauseRef: r.clauseRef ? String(r.clauseRef) : null,
    sourceClauseText: r.sourceClauseText ? String(r.sourceClauseText) : null,
    createdAt: String(r.createdAt ?? ''),
  }));
}

export async function approveRuleAction(ruleId: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const session = await auth();
  const reviewerId = session?.user?.id;
  if (!reviewerId) return { ok: false, error: 'Not authenticated.' };

  const sql = getSql();
  await sql.query(`
    UPDATE policy_rules
    SET staff_reviewed = TRUE,
        reviewed_by = $2,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1 AND signal_source = 'CLIENT_DEFINED' AND staff_reviewed = FALSE
  `, [ruleId, reviewerId]);

  revalidatePath('/policies/review-queue');
  return { ok: true };
}

export async function rejectRuleAction(ruleId: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const sql = getSql();
  await sql.query(`
    UPDATE policy_rules
    SET status = 'archived',
        updated_at = NOW()
    WHERE id = $1 AND signal_source = 'CLIENT_DEFINED' AND staff_reviewed = FALSE
  `, [ruleId]);

  revalidatePath('/policies/review-queue');
  return { ok: true };
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user) throw new Error('Not authenticated.');
  if (session.user.role !== 'staff') throw new Error('Staff only.');
}
