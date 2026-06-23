import { getSql } from '@/lib/db';
import {
  evaluatePolicyContext,
  type PolicyAction,
  type PolicyCondition,
  type PolicyDecision,
  type PolicyRuleForEvaluation,
  type PolicyStatus,
  type PolicyType,
  type ShipmentPolicyContext,
} from './policy-evaluator';
import {
  getGatewayReadinessReport,
  getInsuranceExposureReport,
  getTopGatewayRuleSuggestions,
} from './reports';

export type ClientOption = { id: string; name: string };

export type ClientPolicyRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  policy_type: PolicyType;
  name: string;
  owner: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: PolicyStatus;
  notes: string | null;
  created_at: string;
  document_count: number;
  ruleset_count: number;
  rule_count: number;
};

export type PolicyDocumentRow = {
  id: string;
  client_id: string;
  policy_id: string;
  document_type: string;
  file_name: string;
  source_url: string | null;
  effective_from: string | null;
  effective_to: string | null;
  extraction_status: string;
  raw_text: string | null;
  summary: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type PolicyRulesetRow = {
  id: string;
  client_id: string;
  version: string;
  status: PolicyStatus;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
  rule_count: number;
};

export type PolicyRuleRow = {
  id: string;
  client_id: string;
  ruleset_id: string;
  policy_id: string | null;
  document_id: string | null;
  rule_key: string;
  category: string;
  condition_json: PolicyCondition;
  action_json: PolicyAction;
  severity: 'info' | 'warn' | 'block';
  clause_ref: string | null;
  status: PolicyStatus;
  created_at: string;
  updated_at: string;
};

export type PolicyBacktestRunRow = {
  id: string;
  client_id: string;
  ruleset_id: string;
  period_start: string;
  period_end: string;
  status: string;
  shipments_checked: number;
  violations_found: number;
  preventable_margin_loss: number;
  uninsured_exposure: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type PolicyBacktestResultRow = {
  id: string;
  backtest_run_id: string;
  client_id: string;
  rule_id: string;
  shipment_id: string | null;
  invoice_id: string | null;
  audit_result_id: string | null;
  decision: string;
  category: string;
  message: string;
  suggested_fix: string | null;
  clause_ref: string | null;
  preventable_loss: number;
  uninsured_exposure: number;
  created_at: string;
};

export async function listClientOptions(): Promise<ClientOption[]> {
  const sql = getSql();
  const rows = await sql.query(`
    SELECT id, "Company name" AS name
    FROM "Clients"
    ORDER BY "Company name" NULLS LAST, id
    LIMIT 500
  `);
  return rows.map((row: any) => ({ id: row.id, name: row.name || row.id }));
}

export async function listPolicies(): Promise<ClientPolicyRow[]> {
  const sql = getSql();
  return (await sql.query(`
    SELECT
      p.*,
      c."Company name" AS client_name,
      count(DISTINCT d.id)::int AS document_count,
      count(DISTINCT rs.id)::int AS ruleset_count,
      count(DISTINCT r.id)::int AS rule_count
    FROM client_policies p
    LEFT JOIN "Clients" c ON c.id = p.client_id
    LEFT JOIN policy_documents d ON d.policy_id = p.id
    LEFT JOIN policy_rulesets rs ON rs.client_id = p.client_id
    LEFT JOIN policy_rules r ON r.policy_id = p.id
    GROUP BY p.id, c."Company name"
    ORDER BY p.created_at DESC
    LIMIT 500
  `)) as ClientPolicyRow[];
}

export async function getPolicyDetail(policyId: string) {
  const sql = getSql();
  const [policy] = await sql.query(
    `SELECT p.*, c."Company name" AS client_name
     FROM client_policies p
     LEFT JOIN "Clients" c ON c.id = p.client_id
     WHERE p.id = $1
     LIMIT 1`,
    [policyId]
  ) as (ClientPolicyRow & { client_name: string | null })[];

  if (!policy) return null;

  const [documents, rulesets, rules, runs] = await Promise.all([
    sql.query(
      `SELECT * FROM policy_documents WHERE policy_id = $1 ORDER BY created_at DESC`,
      [policyId]
    ) as Promise<PolicyDocumentRow[]>,
    sql.query(
      `SELECT rs.*, count(r.id)::int AS rule_count
       FROM policy_rulesets rs
       LEFT JOIN policy_rules r ON r.ruleset_id = rs.id
       WHERE rs.client_id = $1
       GROUP BY rs.id
       ORDER BY rs.created_at DESC`,
      [policy.client_id]
    ) as Promise<PolicyRulesetRow[]>,
    sql.query(
      `SELECT * FROM policy_rules WHERE policy_id = $1 ORDER BY created_at DESC`,
      [policyId]
    ) as Promise<PolicyRuleRow[]>,
    sql.query(
      `SELECT br.*
       FROM policy_backtest_runs br
       JOIN policy_rulesets rs ON rs.id = br.ruleset_id
       WHERE rs.client_id = $1
       ORDER BY br.created_at DESC
       LIMIT 20`,
      [policy.client_id]
    ) as Promise<PolicyBacktestRunRow[]>,
  ]);

  return { policy, documents, rulesets, rules, runs };
}

export async function getRulesetDetail(rulesetId: string) {
  const sql = getSql();
  const [ruleset] = await sql.query(
    `SELECT rs.*, count(r.id)::int AS rule_count
     FROM policy_rulesets rs
     LEFT JOIN policy_rules r ON r.ruleset_id = rs.id
     WHERE rs.id = $1
     GROUP BY rs.id
     LIMIT 1`,
    [rulesetId]
  ) as PolicyRulesetRow[];

  if (!ruleset) return null;

  const rules = await loadPolicyRules({ rulesetId, includeDraft: true });
  return { ruleset, rules };
}

export async function createPolicy(input: {
  clientId: string;
  policyType: string;
  name: string;
  owner?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status?: string | null;
  notes?: string | null;
}) {
  const sql = getSql();
  const [row] = await sql.query(
    `INSERT INTO client_policies (
       client_id, policy_type, name, owner, effective_from, effective_to, status, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.clientId,
      input.policyType,
      input.name,
      input.owner || null,
      input.effectiveFrom || null,
      input.effectiveTo || null,
      input.status || 'draft',
      input.notes || null,
    ]
  ) as { id: string }[];
  return row.id;
}

export async function addPolicyDocument(input: {
  clientId: string;
  policyId: string;
  documentType: string;
  fileName: string;
  sourceUrl?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  extractionStatus?: string | null;
  rawText?: string | null;
  summary?: string | null;
  uploadedBy?: string | null;
}) {
  const sql = getSql();
  await sql.query(
    `INSERT INTO policy_documents (
       client_id, policy_id, document_type, file_name, source_url, effective_from,
       effective_to, extraction_status, raw_text, summary, uploaded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.clientId,
      input.policyId,
      input.documentType,
      input.fileName,
      input.sourceUrl || null,
      input.effectiveFrom || null,
      input.effectiveTo || null,
      input.extractionStatus || 'not_started',
      input.rawText || null,
      input.summary || null,
      input.uploadedBy || null,
    ]
  );
}

export async function createRuleset(input: {
  clientId: string;
  version: string;
  status?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  createdBy?: string | null;
}) {
  const sql = getSql();
  const [row] = await sql.query(
    `INSERT INTO policy_rulesets (
       client_id, version, status, effective_from, effective_to, created_by,
       activated_at
     ) VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $3 = 'active' THEN now() ELSE NULL END)
     RETURNING id`,
    [
      input.clientId,
      input.version,
      input.status || 'draft',
      input.effectiveFrom || null,
      input.effectiveTo || null,
      input.createdBy || null,
    ]
  ) as { id: string }[];
  return row.id;
}

export async function addPolicyRule(input: {
  clientId: string;
  rulesetId: string;
  policyId?: string | null;
  documentId?: string | null;
  ruleKey: string;
  category: string;
  conditionJson: PolicyCondition;
  actionJson: PolicyAction;
  severity: string;
  clauseRef?: string | null;
  status?: string | null;
}) {
  const sql = getSql();
  await sql.query(
    `INSERT INTO policy_rules (
       client_id, ruleset_id, policy_id, document_id, rule_key, category,
       condition_json, action_json, severity, clause_ref, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
    [
      input.clientId,
      input.rulesetId,
      input.policyId || null,
      input.documentId || null,
      input.ruleKey,
      input.category,
      JSON.stringify(input.conditionJson),
      JSON.stringify(input.actionJson),
      input.severity,
      input.clauseRef || null,
      input.status || 'draft',
    ]
  );
}

export async function loadPolicyRules(input: {
  rulesetId: string;
  includeDraft?: boolean;
}): Promise<PolicyRuleForEvaluation[]> {
  const sql = getSql();
  const statuses = input.includeDraft ? ['active', 'draft'] : ['active'];
  const rows = await sql.query(
    `SELECT * FROM policy_rules
     WHERE ruleset_id = $1 AND status = ANY($2)
     ORDER BY created_at ASC`,
    [input.rulesetId, statuses]
  ) as PolicyRuleRow[];

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    rulesetId: row.ruleset_id,
    ruleKey: row.rule_key,
    category: row.category,
    conditionJson: row.condition_json,
    actionJson: row.action_json,
    severity: row.severity,
    status: row.status,
    clauseRef: row.clause_ref,
  }));
}

export async function runPolicyBacktest(input: {
  clientId: string;
  rulesetId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const sql = getSql();
  const rules = await loadPolicyRules({ rulesetId: input.rulesetId, includeDraft: true });
  const contexts = await loadBacktestContexts(input);

  await sql.query('BEGIN');
  let runId = '';
  try {
    const [run] = await sql.query(
      `INSERT INTO policy_backtest_runs (
         client_id, ruleset_id, period_start, period_end, status
       ) VALUES ($1,$2,$3,$4,'running')
       RETURNING id`,
      [input.clientId, input.rulesetId, input.periodStart, input.periodEnd]
    ) as { id: string }[];
    runId = run.id;

    const resultRows: PolicyBacktestInsert[] = [];
    for (const context of contexts) {
      const decisions = evaluatePolicyContext({
        context,
        rules,
        mode: 'backtest',
        includeDraft: true,
      }).filter((decision) => decision.decision !== 'ALLOW');

      for (const decision of decisions) {
        resultRows.push(toBacktestInsert(runId, context, decision));
      }
    }

    for (const row of resultRows) {
      await sql.query(
        `INSERT INTO policy_backtest_results (
           backtest_run_id, client_id, rule_id, shipment_id, invoice_id, audit_result_id,
           decision, category, message, suggested_fix, clause_ref, preventable_loss,
           uninsured_exposure
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          row.backtestRunId,
          row.clientId,
          row.ruleId,
          row.shipmentId,
          row.invoiceId,
          row.auditResultId,
          row.decision,
          row.category,
          row.message,
          row.suggestedFix,
          row.clauseRef,
          row.preventableLoss,
          row.uninsuredExposure,
        ]
      );
    }

    const totals = resultRows.reduce((acc, row) => ({
      preventableLoss: acc.preventableLoss + row.preventableLoss,
      uninsuredExposure: acc.uninsuredExposure + row.uninsuredExposure,
    }), { preventableLoss: 0, uninsuredExposure: 0 });

    await sql.query(
      `UPDATE policy_backtest_runs
       SET status = 'completed',
           shipments_checked = $2,
           violations_found = $3,
           preventable_margin_loss = $4,
           uninsured_exposure = $5,
           completed_at = now()
       WHERE id = $1`,
      [runId, contexts.length, resultRows.length, totals.preventableLoss, totals.uninsuredExposure]
    );

    await sql.query('COMMIT');
    return { runId, shipmentsChecked: contexts.length, violationsFound: resultRows.length };
  } catch (err) {
    await sql.query('ROLLBACK');
    if (runId) {
      await sql.query(
        `UPDATE policy_backtest_runs
         SET status = 'failed', error = $2, completed_at = now()
         WHERE id = $1`,
        [runId, err instanceof Error ? err.message : String(err)]
      );
    }
    throw err;
  }
}

export async function listBacktestResults(runId: string): Promise<PolicyBacktestResultRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT * FROM policy_backtest_results
     WHERE backtest_run_id = $1
     ORDER BY preventable_loss DESC, uninsured_exposure DESC, created_at DESC
     LIMIT 200`,
    [runId]
  )) as PolicyBacktestResultRow[];
}

export async function getGatewayAssessment(clientId: string, months = 12) {
  const [readiness, suggestions, insurance, latestBacktests] = await Promise.all([
    getGatewayReadinessReport({ clientId, months }),
    getTopGatewayRuleSuggestions({ clientId, limit: 10 }),
    getInsuranceExposureReport({ clientId, months }),
    listLatestBacktests(clientId),
  ]);

  const preventableMarginLoss = readiness.reduce((sum, row) => sum + Number(row.gateway_roi || 0), 0);
  const uninsuredExposure = insurance.reduce((sum, row) => sum + Number(row.preventable_exposure || 0), 0);
  const policyPreventableLoss = latestBacktests.reduce((sum, row) => sum + Number(row.preventable_margin_loss || 0), 0);
  const policyUninsuredExposure = latestBacktests.reduce((sum, row) => sum + Number(row.uninsured_exposure || 0), 0);

  return {
    readiness,
    suggestions,
    insurance,
    latestBacktests,
    summary: {
      preventableMarginLoss: preventableMarginLoss + policyPreventableLoss,
      uninsuredExposure: uninsuredExposure + policyUninsuredExposure,
      gatewayRoi: preventableMarginLoss,
      policyBacktestLoss: policyPreventableLoss,
    },
  };
}

export async function listLatestBacktests(clientId: string): Promise<PolicyBacktestRunRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT * FROM policy_backtest_runs
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [clientId]
  )) as PolicyBacktestRunRow[];
}

async function loadBacktestContexts(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ShipmentPolicyContext[]> {
  const sql = getSql();

  const insuranceRows = await sql.query(
    `SELECT *
     FROM shipment_insurance_audit_results
     WHERE client_id = $1
       AND created_at::date BETWEEN $2::date AND $3::date
     ORDER BY created_at DESC
     LIMIT 5000`,
    [input.clientId, input.periodStart, input.periodEnd]
  ) as any[];

  const auditRows = await sql.query(
    `SELECT
       id,
       "Invoice" AS invoice,
       "Client" AS client,
       "Carrier SCAC" AS carrier_scac,
       "Variance" AS variance,
       "Gateway estimated savings" AS gateway_estimated_savings,
       "Audited at" AS audited_at
     FROM "Audit Results"
     WHERE $1 = ANY("Client")
       AND "Audited at"::date BETWEEN $2::date AND $3::date
     ORDER BY "Audited at" DESC
     LIMIT 5000`,
    [input.clientId, input.periodStart, input.periodEnd]
  ) as any[];

  return [
    ...insuranceRows.map((row) => ({
      clientId: row.client_id,
      shipmentId: row.shipment_id,
      auditResultId: row.audit_result_id,
      shipperVertical: row.shipper_vertical,
      commodityType: row.commodity_type,
      declaredValue: Number(row.declared_value || 0),
      insuredValue: row.insured_value === null ? null : Number(row.insured_value || 0),
      destinationRiskTier: row.destination_risk_tier,
      documentationReceived: Array.isArray(row.documentation_received) ? row.documentation_received : [],
      uninsuredExposure: Number(row.estimated_uninsured_exposure || 0),
      preventableLoss: 0,
    })),
    ...auditRows.map((row) => ({
      clientId: input.clientId,
      auditResultId: row.id,
      invoiceId: Array.isArray(row.invoice) ? row.invoice[0] : null,
      carrier: row.carrier_scac,
      preventableLoss: Number(row.gateway_estimated_savings || row.variance || 0),
      uninsuredExposure: 0,
    })),
  ];
}

type PolicyBacktestInsert = {
  backtestRunId: string;
  clientId: string;
  ruleId: string;
  shipmentId: string | null;
  invoiceId: string | null;
  auditResultId: string | null;
  decision: string;
  category: string;
  message: string;
  suggestedFix: string | null;
  clauseRef: string | null;
  preventableLoss: number;
  uninsuredExposure: number;
};

function toBacktestInsert(
  runId: string,
  context: ShipmentPolicyContext,
  decision: PolicyDecision
): PolicyBacktestInsert {
  return {
    backtestRunId: runId,
    clientId: context.clientId,
    ruleId: decision.ruleId || 'default_allow',
    shipmentId: context.shipmentId || null,
    invoiceId: context.invoiceId || null,
    auditResultId: context.auditResultId || null,
    decision: decision.decision,
    category: decision.category,
    message: decision.message,
    suggestedFix: decision.suggestedFix || null,
    clauseRef: decision.clauseRef || null,
    preventableLoss: decision.preventableLoss,
    uninsuredExposure: decision.uninsuredExposure,
  };
}
