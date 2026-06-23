/*
  lib/audit/runs.ts — persistence for audit engine run history.

  Server-only. Records each invocation of runAudit() so the console can show
  a history of when audits ran, what they checked, and what they found.
*/

import { getSql } from '@/lib/db';

export type AuditRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  client_id: string | null;
  client_name: string | null;
  dry_run: boolean;
  status: string;            // 'running' | 'success' | 'error'
  invoices_checked: number;
  findings_created: number;
  total_variance: number;
  errors: string[];
  triggered_by: string | null;
};

export async function listRuns(limit = 25): Promise<AuditRun[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM audit_runs ORDER BY started_at DESC LIMIT $1',
    [limit]
  )) as AuditRun[];
}

export async function recordRun(input: {
  clientId: string | null;
  clientName: string | null;
  dryRun: boolean;
  status: 'success' | 'error';
  invoicesChecked: number;
  findingsCreated: number;
  totalVariance: number;
  errors: string[];
  triggeredBy: string | null;
}): Promise<AuditRun> {
  const sql = getSql();
  const rows = (await sql.query(
    `INSERT INTO audit_runs
       (finished_at, client_id, client_name, dry_run, status,
        invoices_checked, findings_created, total_variance, errors, triggered_by)
     VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.clientId,
      input.clientName,
      input.dryRun,
      input.status,
      input.invoicesChecked,
      input.findingsCreated,
      input.totalVariance,
      input.errors,
      input.triggeredBy,
    ]
  )) as AuditRun[];
  return rows[0];
}
