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

/** Valid keys for PolicyCondition — frozen per CONTRACTS.md §2. */
const VALID_CONDITION_KEYS = new Set<string>([
  'declaredValueGte',
  'declaredValueGt',
  'declaredValueLte',
  'insuredValueLtDeclared',
  'carrierIn',
  'carrierNotIn',
  'serviceIn',
  'serviceNotIn',
  'shipperVertical',
  'commodityType',
  'commodityIn',
  'destinationCountryIn',
  'destinationZipIn',
  'destinationRiskTierIn',
  'signatureRequiredAbove',
  'signatureTypeIn',
  'documentationRequired',
  'packageTypeIn',
  'temperatureControlRequired',
  'temperatureMax',
]);

/**
 * Validate that all keys in conditionJson are known PolicyCondition fields.
 * Rejects unknown/typo'd keys so a silently-dead rule is never saved.
 */
export function validateConditionKeys(condition: Record<string, unknown>): void {
  for (const key of Object.keys(condition)) {
    if (!VALID_CONDITION_KEYS.has(key)) {
      throw new Error(
        `Unknown condition key: "${key}". Valid keys are: ${[...VALID_CONDITION_KEYS].sort().join(', ')}`
      );
    }
  }
}

/**
 * Map PolicyCondition keys to the corresponding ShipmentPolicyContext field name.
 * Used to detect which context fields a rule's conditions depend on.
 */
const CONDITION_TO_CONTEXT_FIELD: Record<string, keyof ShipmentPolicyContext> = {
  declaredValueGte: 'declaredValue',
  declaredValueGt: 'declaredValue',
  declaredValueLte: 'declaredValue',
  insuredValueLtDeclared: 'insuredValue',
  carrierIn: 'carrier',
  carrierNotIn: 'carrier',
  serviceIn: 'serviceLevel',
  serviceNotIn: 'serviceLevel',
  shipperVertical: 'shipperVertical',
  commodityType: 'commodityType',
  commodityIn: 'commodityType',
  destinationCountryIn: 'destinationCountry',
  destinationZipIn: 'destinationZip',
  destinationRiskTierIn: 'destinationRiskTier',
  signatureRequiredAbove: 'signatureType',
  signatureTypeIn: 'signatureType',
  documentationRequired: 'documentationReceived',
  packageTypeIn: 'packageType',
  temperatureControlRequired: 'temperatureServiceSelected',
  temperatureMax: 'temperature',
};

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
  mode: string | null;
  data_required_count: number;
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
  return (rows as { id: string; name: string | null }[]).map((row) => ({ id: row.id, name: row.name || row.id }));
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
    ) as unknown as Promise<PolicyDocumentRow[]>,
    sql.query(
      `SELECT rs.*, count(r.id)::int AS rule_count
       FROM policy_rulesets rs
       LEFT JOIN policy_rules r ON r.ruleset_id = rs.id
       WHERE rs.client_id = $1
       GROUP BY rs.id
       ORDER BY rs.created_at DESC`,
      [policy.client_id]
    ) as unknown as Promise<PolicyRulesetRow[]>,
    sql.query(
      `SELECT * FROM policy_rules WHERE policy_id = $1 ORDER BY created_at DESC`,
      [policyId]
    ) as unknown as Promise<PolicyRuleRow[]>,
    sql.query(
      `SELECT br.*
       FROM policy_backtest_runs br
       JOIN policy_rulesets rs ON rs.id = br.ruleset_id
       WHERE rs.client_id = $1
       ORDER BY br.created_at DESC
       LIMIT 20`,
      [policy.client_id]
    ) as unknown as Promise<PolicyBacktestRunRow[]>,
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

/**
 * Find or create a per-client draft ruleset for client-defined rules (ADR 0014).
 * If no draft exists, creates one. If an active ruleset exists, copies its rules
 * forward into the new draft so client-defined rules are additive, not destructive.
 */
export async function findOrCreateClientDraftRuleset(clientId: string): Promise<string> {
  const sql = getSql();

  // 1. Look for existing draft ruleset
  const existing = await sql.query(`
    SELECT id FROM policy_rulesets
    WHERE client_id = $1 AND status = 'draft' AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `, [clientId]) as { id: string }[];

  if (existing.length > 0) return existing[0].id;

  // 2. Find the active ruleset (to copy its rules forward)
  const active = await sql.query(`
    SELECT id FROM policy_rulesets
    WHERE client_id = $1 AND status = 'active' AND deleted_at IS NULL
    ORDER BY effective_from DESC NULLS LAST, created_at DESC LIMIT 1
  `, [clientId]) as { id: string }[];

  // 3. Create the draft ruleset
  const draftId = await createRuleset({
    clientId,
    version: 'Client-Defined',
    status: 'draft',
  });

  // 4. Copy active rules forward into the new draft (additive foundation)
  if (active.length > 0) {
    await sql.query(`
      INSERT INTO policy_rules (
        id, client_id, ruleset_id, policy_id, document_id,
        rule_key, category, condition_json, action_json,
        severity, clause_ref, status, signal_source,
        source_clause_text, confidence, created_at, updated_at
      )
      SELECT
        'pr' || replace(gen_random_uuid()::text, '-', ''),
        client_id, $2, policy_id, document_id,
        rule_key, category, condition_json, action_json,
        severity, clause_ref, 'draft', signal_source,
        source_clause_text, confidence, NOW(), NOW()
      FROM policy_rules
      WHERE ruleset_id = $1 AND status = 'active' AND deleted_at IS NULL
    `, [active[0].id, draftId]);
  }

  return draftId;
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
  // Validate condition keys before saving (backlog: backtest correctness item 7)
  validateConditionKeys(input.conditionJson as Record<string, unknown>);

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
  rulesetId?: string;
  clientId?: string;
  effectiveDate?: string;
  includeDraft?: boolean;
}): Promise<PolicyRuleForEvaluation[]> {
  const sql = getSql();
  const statuses = input.includeDraft ? ['active', 'client_attested', 'draft'] : ['active', 'client_attested'];

  // If a specific ruleset is requested, load it directly
  if (input.rulesetId) {
    const rows = await sql.query(
      `SELECT * FROM policy_rules
       WHERE ruleset_id = $1 AND status = ANY($2)
       ORDER BY created_at ASC`,
      [input.rulesetId, statuses]
    ) as PolicyRuleRow[];

    return rows.map(parseRuleRow);
  }

  // Effective-dated selection: ruleset in force on the given date
  if (input.clientId && input.effectiveDate) {
    const rows = await sql.query(
      `SELECT pr.* FROM policy_rules pr
       JOIN policy_rulesets prs ON pr.ruleset_id = prs.id
       WHERE prs.client_id = $1
         AND prs.status = ANY($2)
         AND pr.status = ANY($2)
         AND (prs.effective_from IS NULL OR prs.effective_from <= $3::date)
         AND (prs.effective_to IS NULL OR prs.effective_to >= $3::date)
       ORDER BY prs.effective_from DESC, pr.category, pr.rule_key`,
      [input.clientId, statuses, input.effectiveDate]
    ) as PolicyRuleRow[];

    return rows.map(parseRuleRow);
  }

  // Fallback: latest active ruleset for a client
  if (input.clientId) {
    const rows = await sql.query(
      `SELECT pr.* FROM policy_rules pr
       JOIN policy_rulesets prs ON pr.ruleset_id = prs.id
       WHERE prs.client_id = $1
         AND prs.status = ANY($2)
         AND pr.status = ANY($2)
       ORDER BY prs.effective_from DESC, pr.category, pr.rule_key`,
      [input.clientId, statuses]
    ) as PolicyRuleRow[];

    return rows.map(parseRuleRow);
  }

  return [];
}

function parseRuleRow(row: PolicyRuleRow): PolicyRuleForEvaluation {
  return {
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
  };
}

export async function runPolicyBacktest(input: {
  clientId: string;
  rulesetId?: string;
  periodStart: string;
  periodEnd: string;
  mode?: 'preview' | 'official';
}) {
  const sql = getSql();
  const mode = input.mode || 'preview';
  const includeDraft = mode === 'preview';

  // ── 1. Load shipment contexts with ship dates ──────────────────
  const { contexts, shipDates } = await loadBacktestContextsWithDates({
    clientId: input.clientId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  if (contexts.length === 0) {
    return { runId: null, shipmentsChecked: 0, violationsFound: 0, dataRequired: 0 };
  }

  // ── 2. Per-shipment effective-dated ruleset selection ──────────
  // Load all rulesets + their rules for the client, then match each
  // shipment to the ruleset active on its "Ship date".

  // Case A: Explicit rulesetId (preview/what-if against a specific ruleset)
  let rulesetRules: Map<string, PolicyRuleForEvaluation[]>; // rulesetId → rules[]
  let shipmentRulesetMap: Map<string, string>;               // shipmentId → rulesetId

  if (input.rulesetId) {
    const rules = await loadPolicyRules({
      rulesetId: input.rulesetId,
      includeDraft,
    });
    rulesetRules = new Map([[input.rulesetId, rules]]);
    shipmentRulesetMap = new Map();
    for (const ctx of contexts) {
      if (ctx.shipmentId) shipmentRulesetMap.set(ctx.shipmentId, input.rulesetId);
    }
  } else {
    // Load all active (or draft for preview) rulesets for the client
    const allRulesets = await loadActiveRulesetsForClient(input.clientId, includeDraft);
    rulesetRules = new Map();
    for (const rs of allRulesets) {
      const rules = await loadPolicyRules({
        rulesetId: rs.id,
        includeDraft,
      });
      rulesetRules.set(rs.id, rules);
    }

    // Match each shipment to its effective ruleset
    shipmentRulesetMap = matchShipmentsToRulesets(contexts, shipDates, allRulesets);
  }

  // ── 3. Evaluate each shipment against its ruleset ─────────────
  // Group contexts by ruleset for batch evaluation
  const contextsByRuleset = new Map<string, ShipmentPolicyContext[]>();
  for (const ctx of contexts) {
    const rsId = ctx.shipmentId ? shipmentRulesetMap.get(ctx.shipmentId) : undefined;
    const key = rsId || '__none__';
    const list = contextsByRuleset.get(key) || [];
    list.push(ctx);
    contextsByRuleset.set(key, list);
  }

  const resultRows: PolicyBacktestInsert[] = [];
  const seenAuditIdsGlobal = new Set<string>(); // cross-ruleset dedup
  let dataRequiredCount = 0;

  for (const [rsId, ctxs] of contextsByRuleset) {
    const rules = rulesetRules.get(rsId) || [];
    if (rules.length === 0) {
      // No applicable ruleset — all contexts are DATA_REQUIRED
      for (const ctx of ctxs) {
        if (!ctx.shipmentId) continue;
        dataRequiredCount++;
        resultRows.push({
          backtestRunId: '', // filled below
          clientId: input.clientId,
          ruleId: 'data_required',
          shipmentId: ctx.shipmentId || null,
          invoiceId: ctx.invoiceId || null,
          auditResultId: ctx.auditResultId || null,
          decision: 'REQUIRE_DOCUMENTATION',
          category: 'DATA_REQUIRED',
          message: 'No applicable ruleset was active for this shipment on its ship date.',
          suggestedFix: 'Define an active ruleset covering this shipment date.',
          clauseRef: null,
          preventableLoss: 0,
          uninsuredExposure: 0,
        });
      }
      continue;
    }

    for (const context of ctxs) {
      const decisions = evaluatePolicyContext({
        context,
        rules,
        mode: 'backtest',
        includeDraft,
      }).filter((d) => d.decision !== 'ALLOW');

      if (decisions.length === 0) {
        // No rule matched → check for tri-valued (DATA_REQUIRED)
        const missingFields = findUnresolvableFields(context, rules);
        if (missingFields.length > 0 && context.shipmentId) {
          dataRequiredCount++;
          resultRows.push({
            backtestRunId: '',
            clientId: input.clientId,
            ruleId: 'data_required',
            shipmentId: context.shipmentId || null,
            invoiceId: context.invoiceId || null,
            auditResultId: context.auditResultId || null,
            decision: 'REQUIRE_DOCUMENTATION',
            category: 'DATA_REQUIRED',
            message: `Cannot evaluate: missing context fields — ${missingFields.join(', ')}.`,
            suggestedFix: 'Ingest the missing shipment data (shipper vertical, declared value, carrier, etc.).',
            clauseRef: null,
            preventableLoss: 0,
            uninsuredExposure: context.uninsuredExposure ?? 0,
          });
        }
        continue;
      }

      for (const decision of decisions) {
        // Dedup preventable loss by audit_result_id (bug 3 fix)
        if (context.auditResultId && seenAuditIdsGlobal.has(context.auditResultId)) {
          // This finding was already counted — attribute zero to avoid double-count
          resultRows.push({
            backtestRunId: '',
            clientId: input.clientId,
            ruleId: decision.ruleId || 'default_allow',
            shipmentId: context.shipmentId || null,
            invoiceId: context.invoiceId || null,
            auditResultId: context.auditResultId || null,
            decision: decision.decision,
            category: decision.category,
            message: `${decision.message} (deduped — loss attributed to first matching rule)`,
            suggestedFix: decision.suggestedFix || null,
            clauseRef: decision.clauseRef || null,
            preventableLoss: 0, // already counted
            uninsuredExposure: 0,
          });
          continue;
        }

        if (context.auditResultId) {
          seenAuditIdsGlobal.add(context.auditResultId);
        }

        resultRows.push({
          backtestRunId: '',
          clientId: input.clientId,
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
        });
      }
    }
  }

  // ── 4. Compute totals (deduped) ───────────────────────────────
  const totals = resultRows.reduce((acc, row) => ({
    preventableLoss: acc.preventableLoss + row.preventableLoss,
    uninsuredExposure: acc.uninsuredExposure + row.uninsuredExposure,
  }), { preventableLoss: 0, uninsuredExposure: 0 });

  const effectiveRulesetId = input.rulesetId || findDominantRuleset(shipmentRulesetMap);

  // ── 5. Write run and results in a transaction ─────────────────
  await sql.query('BEGIN');
  let runId = '';
  try {
    const [run] = await sql.query(
      `INSERT INTO policy_backtest_runs (
         client_id, ruleset_id, period_start, period_end, status, mode, input_snapshot,
         data_required_count
       ) VALUES ($1,$2,$3,$4,'running',$5,$6::jsonb,$7)
       RETURNING id`,
      [
        input.clientId,
        effectiveRulesetId,
        input.periodStart,
        input.periodEnd,
        mode,
        JSON.stringify(contexts.map(stripContextForSnapshot)),
        dataRequiredCount,
      ]
    ) as { id: string }[];
    runId = run.id;

    // Stamp runId on all result rows and insert
    for (const row of resultRows) {
      row.backtestRunId = runId;
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
    return {
      runId,
      shipmentsChecked: contexts.length,
      violationsFound: resultRows.length,
      dataRequired: dataRequiredCount,
    };
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

/**
 * Load all active (or draft for preview) rulesets for a client, including
 * effective_from/effective_to for per-shipment matching.
 */
async function loadActiveRulesetsForClient(
  clientId: string,
  includeDraft: boolean,
): Promise<{ id: string; effectiveFrom: string | null; effectiveTo: string | null }[]> {
  const sql = getSql();
  const statuses = includeDraft
    ? ['active', 'client_attested', 'draft']
    : ['active', 'client_attested'];

  return (await sql.query(
    `SELECT id, effective_from AS "effectiveFrom", effective_to AS "effectiveTo"
     FROM policy_rulesets
     WHERE client_id = $1
       AND status = ANY($2)
     ORDER BY effective_from DESC NULLS LAST`,
    [clientId, statuses]
  )) as { id: string; effectiveFrom: string | null; effectiveTo: string | null }[];
}

/**
 * Match each shipment to the ruleset active on its ship date.
 * Returns a map of shipmentId → rulesetId.
 */
function matchShipmentsToRulesets(
  contexts: ShipmentPolicyContext[],
  shipDates: Map<string, string>,
  rulesets: { id: string; effectiveFrom: string | null; effectiveTo: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const ctx of contexts) {
    if (!ctx.shipmentId) continue;
    const shipDate = shipDates.get(ctx.shipmentId);
    if (!shipDate) continue;

    // Find the ruleset whose effective window covers this ship date
    const matching = rulesets.find((rs) => {
      const fromOk = !rs.effectiveFrom || rs.effectiveFrom <= shipDate;
      const toOk = !rs.effectiveTo || rs.effectiveTo >= shipDate;
      return fromOk && toOk;
    });

    if (matching) {
      map.set(ctx.shipmentId, matching.id);
    }
  }

  return map;
}

/**
 * Find the dominant ruleset (most frequently matched) for the run record.
 */
function findDominantRuleset(shipmentRulesetMap: Map<string, string>): string {
  const counts = new Map<string, number>();
  for (const rsId of shipmentRulesetMap.values()) {
    counts.set(rsId, (counts.get(rsId) || 0) + 1);
  }
  let dominant = '';
  let maxCount = 0;
  for (const [rsId, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = rsId;
    }
  }
  return dominant;
}

/**
 * Check which condition-referenced context fields are null/missing.
 * When the evaluator returns ALLOW but rules reference null fields,
 * the result is DATA_REQUIRED (tri-valued evaluation — bug 5 fix).
 */
function findUnresolvableFields(
  context: ShipmentPolicyContext,
  rules: PolicyRuleForEvaluation[],
): string[] {
  const missing = new Set<string>();

  for (const rule of rules) {
    const condition = rule.conditionJson as Record<string, unknown>;
    for (const [condKey, ctxField] of Object.entries(CONDITION_TO_CONTEXT_FIELD)) {
      if (condition[condKey] !== undefined && condition[condKey] !== null) {
        const value: unknown = context[ctxField];
        if (value === null || value === undefined) {
          missing.add(ctxField);
        } else if (Array.isArray(value) && (value as unknown[]).length === 0) {
          missing.add(ctxField);
        }
      }
    }
  }

  return [...missing];
}

/**
 * Strip context to a safe snapshot for JSON storage (remove circular refs, etc.).
 */
function stripContextForSnapshot(ctx: ShipmentPolicyContext): Record<string, unknown> {
  return {
    shipmentId: ctx.shipmentId,
    invoiceId: ctx.invoiceId,
    auditResultId: ctx.auditResultId,
    carrier: ctx.carrier,
    serviceLevel: ctx.serviceLevel,
    destinationZip: ctx.destinationZip,
    destinationCountry: ctx.destinationCountry,
    destinationRiskTier: ctx.destinationRiskTier,
    shipperVertical: ctx.shipperVertical,
    commodityType: ctx.commodityType,
    declaredValue: ctx.declaredValue,
    insuredValue: ctx.insuredValue,
    insuranceProvider: ctx.insuranceProvider,
    signatureType: ctx.signatureType,
    packageType: ctx.packageType,
    documentationReceived: ctx.documentationReceived,
    preventableLoss: ctx.preventableLoss,
    uninsuredExposure: ctx.uninsuredExposure,
  };
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
    listLatestBacktests(clientId, { mode: 'official' }),
  ]);

  // Audit-side metrics (from "Audit Results" gateway tags)
  const preventableMarginLoss = readiness.reduce((sum, row) => sum + Number(row.gateway_roi || 0), 0);
  const uninsuredExposure = insurance.reduce((sum, row) => sum + Number(row.preventable_exposure || 0), 0);

  // Policy-backtest metrics (separate dimension — NOT ADDED to audit metrics)
  // These come from policy_backtest_runs and represent the policy evaluator's view.
  // They may overlap with audit-ROI; summing would double-count the same dollars.
  const policyPreventableLoss = latestBacktests.reduce((sum, row) => sum + Number(row.preventable_margin_loss || 0), 0);
  const policyUninsuredExposure = latestBacktests.reduce((sum, row) => sum + Number(row.uninsured_exposure || 0), 0);

  return {
    readiness,
    suggestions,
    insurance,
    latestBacktests,
    summary: {
      // Audit-engine view (tagged findings in "Audit Results")
      preventableMarginLoss,
      uninsuredExposure,
      // Policy-evaluator view (separate backtest dimension)
      policyBacktestLoss: policyPreventableLoss,
      policyBacktestUninsured: policyUninsuredExposure,
      // Backward-compat: gatewayRoi mirrors preventableMarginLoss
      gatewayRoi: preventableMarginLoss,
      // Note: these are intentionally NOT summed — they measure different things
      // and may overlap. The audit ROI counts what was flagged; the backtest
      // loss counts what a policy ruleset would have found.
    },
  };
}

export async function listLatestBacktests(
  clientId: string,
  opts?: { mode?: 'preview' | 'official'; limit?: number },
): Promise<PolicyBacktestRunRow[]> {
  const sql = getSql();
  const params: unknown[] = [clientId];
  const where = ['client_id = $1'];

  if (opts?.mode) {
    params.push(opts.mode);
    where.push(`mode = $${params.length}`);
  }

  params.push(opts?.limit ?? 10);
  const limitParam = params.length;

  return (await sql.query(
    `SELECT * FROM policy_backtest_runs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${limitParam}`,
    params
  )) as PolicyBacktestRunRow[];
}

/**
 * Load backtest contexts using the shipment-spine model (ADR 0001).
 *
 * Builds ONE ShipmentPolicyContext per shipment in the period, with:
 *   - Billing axis: "Shipments" ← "Invoices" ← "Audit Results" (GIN-indexed joins)
 *   - Insurance axis: shipment_insurance_audit_results (direct shipment_id join)
 *
 * Also returns per-shipment ship dates for effective-dated ruleset selection.
 *
 * Fixes (all 6 bugs from ADR 0001):
 *   1. Shipment spine — axis-crossing rules now match (was: per-source disjoint streams)
 *   2. Keyset pagination — no LIMIT 5000 silent truncation
 *   3. Dedup by audit_result_id — preventable loss counted once per finding
 *   4. Multi-shipment invoices → DATA_REQUIRED tag, not invoice[0] mis-attribution
 *   5. Tri-valued eval — null/unknown fields preserved (not silently zeroed)
 *   6. Ship date carried for effective-dated ruleset selection
 *
 * Deterministic only. No LLM. Keyset-pagination friendly.
 * FROZEN contract types (CONTRACTS.md §2).
 */
async function loadBacktestContextsWithDates(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ contexts: ShipmentPolicyContext[]; shipDates: Map<string, string> }> {
  const sql = getSql();
  const PAGE_SIZE = 500;
  const contexts: ShipmentPolicyContext[] = [];
  const shipDates = new Map<string, string>(); // shipmentId → "Ship date"
  let cursor = '';

  // ── 1. Load all shipment IDs in the period (keyset-paginated) ──
  const shipmentIds: string[] = [];
  const shipmentRows: Record<string, any> = {};

  while (true) {
    const batch = await sql.query(
      `SELECT id, "Ship date", "Carrier", "Service level",
              "Destination zip", "Address classification"
       FROM "Shipments"
       WHERE "Ship date" >= $1 AND "Ship date" <= $2
         ${cursor ? `AND id > $3` : ''}
       ORDER BY id
       LIMIT ${PAGE_SIZE}`,
      cursor
        ? [input.periodStart, input.periodEnd, cursor]
        : [input.periodStart, input.periodEnd]
    ) as any[];

    if (batch.length === 0) break;

    for (const row of batch) {
      shipmentIds.push(row.id);
      shipmentRows[row.id] = row;
      shipDates.set(row.id, row['Ship date']);
    }
    cursor = batch[batch.length - 1].id;

    if (batch.length < PAGE_SIZE) break;
  }

  if (shipmentIds.length === 0) return { contexts: [], shipDates };

  // ── 2. Load invoices linked to these shipments (chunked) ──────
  const invoiceMap = new Map<string, any[]>(); // shipmentId → invoices[]
  const invoiceIds: string[] = [];

  for (let i = 0; i < shipmentIds.length; i += 200) {
    const chunk = shipmentIds.slice(i, i + 200);
    const rows = await sql.query(
      `SELECT id, "Shipment", client_id
       FROM "Invoices"
       WHERE client_id = $1
         AND "Shipment" && $2::text[]`,
      [input.clientId, chunk]
    ) as any[];

    for (const row of rows) {
      invoiceIds.push(row.id);
      const linked = (row.Shipment || []) as string[];
      for (const sid of linked) {
        if (shipmentRows[sid]) {
          const list = invoiceMap.get(sid) || [];
          list.push(row);
          invoiceMap.set(sid, list);
        }
      }
    }
  }

  // ── 3. Load audit results linked to those invoices (chunked) ──
  const auditByInvoice = new Map<string, any[]>(); // invoiceId → audit[]
  const auditResultIds = new Set<string>();

  if (invoiceIds.length > 0) {
    for (let i = 0; i < invoiceIds.length; i += 200) {
      const chunk = invoiceIds.slice(i, i + 200);
      const rows = await sql.query(
        `SELECT id, "Invoice", client_id AS "Client", "Carrier SCAC",
                "Variance", "Gateway estimated savings",
                "Gateway preventability", "Gateway category",
                "Gateway rule suggestion", "Detected by"
         FROM "Audit Results"
        WHERE client_id = $1
           AND "Audited at"::date BETWEEN $2::date AND $3::date
           AND "Invoice" && $4::text[]`,
        [input.clientId, input.periodStart, input.periodEnd, chunk]
      ) as any[];

      for (const row of rows) {
        auditResultIds.add(row.id);
        const linked = (row.Invoice || []) as string[];
        for (const invId of linked) {
          if (invoiceIds.includes(invId)) {
            const list = auditByInvoice.get(invId) || [];
            list.push(row);
            auditByInvoice.set(invId, list);
          }
        }
      }
    }
  }

  // ── 4. Load insurance results linked to those shipments ───────
  const insuranceByShipment = new Map<string, any>(); // shipmentId → row

  for (let i = 0; i < shipmentIds.length; i += 200) {
    const chunk = shipmentIds.slice(i, i + 200);
    const rows = await sql.query(
      `SELECT *
       FROM shipment_insurance_audit_results
       WHERE client_id = $1
         AND shipment_id = ANY($2::text[])
         AND created_at::date BETWEEN $3::date AND $4::date`,
      [input.clientId, chunk, input.periodStart, input.periodEnd]
    ) as any[];

    for (const row of rows) {
      if (row.shipment_id) {
        insuranceByShipment.set(row.shipment_id, row);
      }
    }
  }

  // ── 5. Merge into one ShipmentPolicyContext per shipment ──────
  // Dedup: preventable loss is keyed by audit_result_id (ADR 0001)
  const seenAuditIds = new Set<string>();

  for (const [shipmentId, shipment] of Object.entries(shipmentRows)) {
    const invoices = invoiceMap.get(shipmentId) || [];
    const insurance = insuranceByShipment.get(shipmentId);

    let preventableLoss = 0;
    let uninsuredExposure = 0;
    const linkedAuditIds: string[] = [];
    const linkedInvoiceIds: string[] = [];
    let multiShipmentInvoice = false;

    for (const inv of invoices) {
      linkedInvoiceIds.push(inv.id);

      // Multi-shipment invoice detection (bug 4 fix)
      const shipmentLinks = (inv.Shipment || []) as string[];
      if (shipmentLinks.length > 1) {
        multiShipmentInvoice = true;
      }

      const audits = auditByInvoice.get(inv.id) || [];
      for (const ar of audits) {
        if (!seenAuditIds.has(ar.id)) {
          seenAuditIds.add(ar.id);
          linkedAuditIds.push(ar.id);
          preventableLoss += Number(ar['Gateway estimated savings'] || ar['Variance'] || 0);
        }
      }
    }

    if (insurance) {
      uninsuredExposure = Number(insurance.estimated_uninsured_exposure || 0);
    }

    // Build the context — both axes present (bug 1 fix)
    const context: ShipmentPolicyContext = {
      clientId: input.clientId,
      shipmentId,
      invoiceId: linkedInvoiceIds.length === 1 ? linkedInvoiceIds[0] : null,
      auditResultId: linkedAuditIds.length === 1 ? linkedAuditIds[0] : null,
      carrier: shipment['Carrier'] || null,
      serviceLevel: shipment['Service level'] || null,
      destinationZip: shipment['Destination zip'] || null,
      destinationCountry: null,
      destinationRiskTier: insurance?.destination_risk_tier || null,
      shipperVertical: insurance?.shipper_vertical || null,
      commodityType: insurance?.commodity_type || null,
      declaredValue: insurance ? Number(insurance.declared_value || 0) : null,
      insuredValue: insurance ? (insurance.insured_value === null ? null : Number(insurance.insured_value)) : null,
      insuranceProvider: null,
      signatureType: null,
      packageType: null,
      documentationReceived: insurance ? (Array.isArray(insurance.documentation_received) ? insurance.documentation_received : []) : null,
      preventableLoss,
      uninsuredExposure,
    };

    // Multi-shipment invoice: tag DATA_REQUIRED, don't mis-attribute (bug 4 fix)
    // Invoice-level audit loss without a 1:1 shipment link → honest gap
    if (multiShipmentInvoice && linkedInvoiceIds.length === 0) {
      context.preventableLoss = 0;
    }

    contexts.push(context);
  }

  return { contexts, shipDates };
}

/**
 * Retained for backward compatibility: returns just contexts.
 * Prefer loadBacktestContextsWithDates for effective-dated ruleset selection.
 */
async function loadBacktestContexts(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ShipmentPolicyContext[]> {
  const result = await loadBacktestContextsWithDates(input);
  return result.contexts;
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

// ── T4 Client Ambiguity Dashboard (ADR 0012 D5) ────────────────────

export type UnmappedClauseRow = {
  id: string;
  clientId: string;
  policyId: string | null;
  policyName: string | null;
  documentId: string | null;
  documentName: string | null;
  clauseRef: string | null;
  clauseText: string;
  exclusionType: string;
  status: string;
  reason: string | null;
  createdAt: string;
};

/**
 * Fetch all unmapped/ambiguous clauses for a client that need T4 decisions.
 * Returns scope exclusion rows with status 'pending_review' plus any
 * clause_embeddings marked as 'unmapped' that don't yet have exclusion rows.
 */
export async function getUnmappedClausesForClient(clientId: string): Promise<UnmappedClauseRow[]> {
  const sql = await getSql();

  const rows = await sql.query(`
    SELECT
      pse.id,
      pse.client_id AS "clientId",
      pse.policy_id AS "policyId",
      cp.name AS "policyName",
      pse.clause_ref AS "clauseRef",
      pse.clause_text AS "clauseText",
      pse.exclusion_type AS "exclusionType",
      pse.status,
      pse.reason,
      pse.created_at AS "createdAt"
    FROM policy_scope_exclusions pse
    LEFT JOIN client_policies cp ON cp.id = pse.policy_id
    WHERE pse.client_id = $1
      AND pse.status IN ('pending_review', 'staff_review')
      AND pse.deleted_at IS NULL
    ORDER BY pse.created_at DESC
  `, [clientId]) as Record<string, unknown>[];

  return rows.map(r => ({
    id: String(r.id ?? ''),
    clientId: String(r.clientId ?? ''),
    policyId: r.policyId ? String(r.policyId) : null,
    policyName: r.policyName ? String(r.policyName) : null,
    documentId: null,
    documentName: null,
    clauseRef: r.clauseRef ? String(r.clauseRef) : null,
    clauseText: String(r.clauseText ?? ''),
    exclusionType: String(r.exclusionType ?? 'pending_review'),
    status: String(r.status ?? 'pending_review'),
    reason: r.reason ? String(r.reason) : null,
    createdAt: String(r.createdAt ?? ''),
  }));
}

/**
 * Store an unmapped clause from the pipeline as a pending T4 review item.
 * Idempotent — if the same (clientId, clauseText) exists as pending_review,
 * bumps updated_at instead of creating a duplicate.
 */
export async function storeUnmappedClause(params: {
  clientId: string;
  policyId?: string;
  clauseRef?: string;
  clauseText: string;
}): Promise<string | null> {
  const sql = await getSql();

  // Check for existing pending record
  const existing = await sql.query(`
    SELECT id FROM policy_scope_exclusions
    WHERE client_id = $1 AND clause_text = $2 AND status = 'pending_review' AND deleted_at IS NULL
    LIMIT 1
  `, [params.clientId, params.clauseText]) as Record<string, unknown>[];

  if (existing.length > 0) {
    // Bump updated_at on existing
    await sql.query(`
      UPDATE policy_scope_exclusions
      SET updated_at = NOW()
      WHERE id = $1
    `, [existing[0].id]);
    return existing[0].id as string;
  }

  // Insert new
  const result = await sql.query(`
    INSERT INTO policy_scope_exclusions (
      id, client_id, policy_id, clause_ref, clause_text,
      exclusion_type, status
    ) VALUES (
      'pse' || replace(gen_random_uuid()::text, '-', ''),
      $1, $2, $3, $4, 'flag', 'pending_review'
    )
    RETURNING id
  `, [params.clientId, params.policyId || null, params.clauseRef || null, params.clauseText]) as Record<string, unknown>[];

  return result[0]?.id as string ?? null;
}

// ── Phase 4: Taxonomy Discovery ─────────────────────────────────────

export type TaxonomyCandidateRow = {
  id: string;
  ruleKey: string;
  inferredType: string;
  inferredBounds: Record<string, unknown> | null;
  description: string | null;
  sourceClause: string;
  documentId: string | null;
  clauseRef: string | null;
  surfacingClientId: string;
  seenCount: number;
  lifecycleStatus: string;
  promotedBy: string | null;
  promotedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Upsert a taxonomy candidate. Dedup by rule_key — bumps seen_count on conflict.
 * Tier-0 structural metadata only; no client values stored.
 */
export async function upsertTaxonomyCandidate(params: {
  ruleKey: string;
  inferredType?: string;
  inferredBounds?: Record<string, unknown>;
  sourceClause: string;
  documentId?: string;
  clauseRef?: string;
  surfacingClientId: string;
}): Promise<string | null> {
  const sql = await getSql();

  // Check existing by rule_key (soft-delete aware)
  const existing = await sql.query(`
    SELECT id, seen_count, surfacing_client_id FROM policy_taxonomy_candidates
    WHERE rule_key = $1 AND deleted_at IS NULL
    LIMIT 1
  `, [params.ruleKey]) as Record<string, unknown>[];

  if (existing.length > 0) {
    // Bump seen_count and update
    const newCount = (Number(existing[0].seen_count) || 1) + 1;
    await sql.query(`
      UPDATE policy_taxonomy_candidates
      SET seen_count = $2, updated_at = NOW()
      WHERE id = $1
    `, [existing[0].id, newCount]);
    return existing[0].id as string;
  }

  // Insert new candidate
  const result = await sql.query(`
    INSERT INTO policy_taxonomy_candidates (
      id, rule_key, inferred_type, inferred_bounds,
      source_clause, document_id, clause_ref,
      surfacing_client_id, seen_count, lifecycle_status
    ) VALUES (
      'ptc' || replace(gen_random_uuid()::text, '-', ''),
      $1, $2, $3::jsonb,
      $4, $5, $6,
      $7, 1, 'captured'
    )
    RETURNING id
  `, [
    params.ruleKey,
    params.inferredType || 'string',
    params.inferredBounds ? JSON.stringify(params.inferredBounds) : null,
    params.sourceClause,
    params.documentId || null,
    params.clauseRef || null,
    params.surfacingClientId,
  ]) as Record<string, unknown>[];

  return result[0]?.id as string ?? null;
}

/**
 * Get all taxonomy candidates for staff review, ranked by seen_count DESC.
 */
export async function getTaxonomyCandidates(filters?: {
  lifecycleStatus?: string;
  surfacingClientId?: string;
  limit?: number;
}): Promise<TaxonomyCandidateRow[]> {
  const sql = await getSql();
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters?.lifecycleStatus) {
    conditions.push(`lifecycle_status = $${paramIdx++}`);
    params.push(filters.lifecycleStatus);
  }
  if (filters?.surfacingClientId) {
    conditions.push(`surfacing_client_id = $${paramIdx++}`);
    params.push(filters.surfacingClientId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 100;

  const rows = await sql.query(`
    SELECT
      id, rule_key AS "ruleKey", inferred_type AS "inferredType",
      inferred_bounds AS "inferredBounds", description,
      source_clause AS "sourceClause", document_id AS "documentId",
      clause_ref AS "clauseRef", surfacing_client_id AS "surfacingClientId",
      seen_count::int AS "seenCount", lifecycle_status AS "lifecycleStatus",
      promoted_by AS "promotedBy", promoted_at AS "promotedAt",
      rejected_by AS "rejectedBy", rejected_at AS "rejectedAt",
      reject_reason AS "rejectReason",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM policy_taxonomy_candidates
    ${where}
    ORDER BY seen_count DESC
    LIMIT $${paramIdx}
  `, [...params, limit]) as unknown as TaxonomyCandidateRow[];

  return rows;
}

/**
 * Get the set of known rule_keys from active taxonomy (candidates that reached extractable+).
 * Used by the pipeline to decide if a clause maps to a known key or is L3 novel.
 */
export async function getKnownRuleKeys(): Promise<Set<string>> {
  const sql = await getSql();
  const rows = await sql.query(`
    SELECT rule_key FROM policy_taxonomy_candidates
    WHERE lifecycle_status IN ('extractable', 'enforceable')
      AND deleted_at IS NULL
    UNION
    SELECT rule_key FROM policy_rules
    WHERE deleted_at IS NULL
  `) as { rule_key: string }[];

  return new Set(rows.map(r => r.rule_key));
}
