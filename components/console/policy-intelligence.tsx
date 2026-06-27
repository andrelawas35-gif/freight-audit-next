'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  addDocumentAction,
  addRuleAction,
  activateRulesetAction,
  attestRulesetAction,
  createPolicyAction,
  createRulesetAction,
  runBacktestAction,
  type PolicyActionState,
} from '@/app/(console)/console/policies/actions';
import { Badge, Btn, Card, ConsoleEmptyState, KPI, SectionLabel, TableFooter } from '@/components/ui/primitives';
import {
  POLICY_DOCUMENT_STATUSES,
  POLICY_TYPES,
  type PolicyType,
} from '@/lib/intelligence/policy-evaluator';
import type {
  ClientOption,
  ClientPolicyRow,
  PolicyBacktestResultRow,
  PolicyBacktestRunRow,
  PolicyDocumentRow,
  PolicyRuleRow,
  PolicyRulesetRow,
} from '@/lib/intelligence/policy-service';

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 8px',
  fontSize: 12,
  color: 'var(--ink)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ink-2)',
};

const typeLabels: Record<PolicyType | string, string> = {
  carrier_contract: 'Carrier contract',
  carrier_tariff: 'Carrier tariff',
  '3pl_sla': '3PL SLA',
  insurance_policy: 'Insurance policy',
  claims_policy: 'Claims policy',
  shipping_sop: 'Shipping SOP',
  packaging_standard: 'Packaging standard',
  email_exception: 'Email exception',
};

export function PoliciesDashboard({
  policies,
  clients,
}: {
  policies: ClientPolicyRow[];
  clients: ClientOption[];
}) {
  const active = policies.filter((p) => p.status === 'active').length;
  const documents = policies.reduce((sum, p) => sum + p.document_count, 0);
  const rules = policies.reduce((sum, p) => sum + p.rule_count, 0);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <KPI label="Policies" value={policies.length} sub="client rule sources" accentBar="var(--blue)" />
        <KPI label="Active" value={active} sub="ready for default use" tone={active ? 'green' : 'ink'} />
        <KPI label="Documents" value={documents} sub="source materials" />
        <KPI label="Rules" value={rules} sub="structured controls" tone={rules ? 'amber' : 'ink'} />
      </div>

      <SectionLabel>Create policy shell</SectionLabel>
      <NewPolicyForm clients={clients} />

      <SectionLabel>Policy inventory</SectionLabel>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Client</th>
              <th>Type</th>
              <th>Status</th>
              <th>Effective</th>
              <th>Docs</th>
              <th>Rules</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>
                  <Link href={`/policies/${policy.id}`} style={{ color: 'var(--blue-ink)', fontWeight: 700, textDecoration: 'none' }}>
                    {policy.name}
                  </Link>
                  {policy.owner && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{policy.owner}</div>}
                </td>
                <td>{policy.client_name || policy.client_id}</td>
                <td>{typeLabels[policy.policy_type] || policy.policy_type}</td>
                <td><StatusBadge status={policy.status} /></td>
                <td className="mono" style={{ fontSize: 11 }}>{formatRange(policy.effective_from, policy.effective_to)}</td>
                <td className="mono">{policy.document_count}</td>
                <td className="mono">{policy.rule_count}</td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <ConsoleEmptyState
                    icon="shield"
                    heading="No policy intelligence yet"
                    description="Create a policy shell for a client, then add source documents and structured rules."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TableFooter showing={policies.length} total={policies.length} label="policies" />
      </Card>
    </div>
  );
}

export function PolicyDetailWorkbench({
  policy,
  documents,
  rulesets,
  rules,
  runs,
}: {
  policy: ClientPolicyRow;
  documents: PolicyDocumentRow[];
  rulesets: PolicyRulesetRow[];
  rules: PolicyRuleRow[];
  runs: PolicyBacktestRunRow[];
}) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0 }}>{policy.name}</h1>
            <StatusBadge status={policy.status} />
          </div>
          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {policy.client_name || policy.client_id} / {typeLabels[policy.policy_type] || policy.policy_type} / {formatRange(policy.effective_from, policy.effective_to)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/policies/${policy.id}/rules`}><Btn type="button" size="sm">Rules</Btn></Link>
          <Link href={`/policies/${policy.id}/backtests`}><Btn type="button" size="sm">Backtests</Btn></Link>
          <Link href={`/gateway-readiness/${policy.client_id}`}><Btn type="button" size="sm" variant="amber">Readiness</Btn></Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <KPI label="Documents" value={documents.length} sub="source records" />
        <KPI label="Rulesets" value={rulesets.length} sub="versions" />
        <KPI label="Rules" value={rules.length} sub="structured controls" tone={rules.length ? 'green' : 'ink'} />
        <KPI label="Backtests" value={runs.length} sub="recent runs" />
      </div>

      <SectionLabel>Add document metadata</SectionLabel>
      <PolicyDocumentForm policy={policy} />

      <SectionLabel right={<span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>source materials are staff-only</span>}>
        Documents
      </SectionLabel>
      <DocumentTable documents={documents} />

      <SectionLabel>Create ruleset</SectionLabel>
      <RulesetForm policy={policy} />

      <SectionLabel>Rulesets</SectionLabel>
      <RulesetTable policyId={policy.id} rulesets={rulesets} />

      <AttestationPanel policyId={policy.id} rulesets={rulesets} />

      <ScopeStatement policy={policy} rulesets={rulesets} rules={rules} />

      <GuaranteeCard />
    </div>
  );
}

export function PolicyRulesWorkbench({
  policy,
  documents,
  rulesets,
  rules,
}: {
  policy: ClientPolicyRow;
  documents: PolicyDocumentRow[];
  rulesets: PolicyRulesetRow[];
  rules: PolicyRuleRow[];
}) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto' }}>
      <Header policy={policy} active="rules" />
      <SectionLabel>Add structured rule</SectionLabel>
      <PolicyRuleForm policy={policy} documents={documents} rulesets={rulesets} />
      <SectionLabel>Policy rules</SectionLabel>
      <RulesTable rules={rules} rulesets={rulesets} />
    </div>
  );
}

export function PolicyBacktestsWorkbench({
  policy,
  rulesets,
  runs,
  results,
}: {
  policy: ClientPolicyRow;
  rulesets: PolicyRulesetRow[];
  runs: PolicyBacktestRunRow[];
  results: PolicyBacktestResultRow[];
}) {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto' }}>
      <Header policy={policy} active="backtests" />
      <SectionLabel>Run historical backtest</SectionLabel>
      <BacktestForm policy={policy} rulesets={rulesets} />
      <SectionLabel>Recent backtests</SectionLabel>
      <BacktestTable runs={runs} />
      <SectionLabel>Latest violation sample</SectionLabel>
      <BacktestResultsTable results={results} />
    </div>
  );
}

function Header({ policy, active }: { policy: ClientPolicyRow; active: 'rules' | 'backtests' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>{policy.name}</h1>
        <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>{policy.client_name || policy.client_id}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/policies/${policy.id}`}><Btn type="button" size="sm">Detail</Btn></Link>
        <Link href={`/policies/${policy.id}/rules`}><Btn type="button" size="sm" variant={active === 'rules' ? 'amber' : 'default'}>Rules</Btn></Link>
        <Link href={`/policies/${policy.id}/backtests`}><Btn type="button" size="sm" variant={active === 'backtests' ? 'amber' : 'default'}>Backtests</Btn></Link>
      </div>
    </div>
  );
}

function NewPolicyForm({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(createPolicyAction, undefined);
  return (
    <Card>
      <form action={action} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
        <Col label="Client">
          <select name="clientId" required style={inputStyle} defaultValue="">
            <option value="">Select client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </Col>
        <Col label="Type">
          <select name="policyType" style={inputStyle} defaultValue="insurance_policy">
            {POLICY_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
          </select>
        </Col>
        <Col label="Name"><input name="name" required placeholder="Jewelry insurance policy" style={inputStyle} /></Col>
        <Col label="Owner"><input name="owner" placeholder="Ops / broker" style={inputStyle} /></Col>
        <Col label="Status">
          <select name="status" style={inputStyle} defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="client_attested">Client attested</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Col>
        <Col label="Effective from"><input name="effectiveFrom" type="date" style={inputStyle} /></Col>
        <Col label="Effective to"><input name="effectiveTo" type="date" style={inputStyle} /></Col>
        <Col label="Notes"><input name="notes" placeholder="Optional" style={inputStyle} /></Col>
        <button disabled={pending} style={buttonStyle}>{pending ? 'Creating...' : 'Create policy'}</button>
      </form>
      <ActionNote state={state} />
    </Card>
  );
}

function PolicyDocumentForm({ policy }: { policy: ClientPolicyRow }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(addDocumentAction, undefined);
  return (
    <Card>
      <form action={action} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
        <input type="hidden" name="clientId" value={policy.client_id} />
        <input type="hidden" name="policyId" value={policy.id} />
        <Col label="Document type"><input name="documentType" required placeholder="policy_rider" style={inputStyle} /></Col>
        <Col label="File/source name"><input name="fileName" required placeholder="2026 policy PDF" style={inputStyle} /></Col>
        <Col label="Source URL/reference"><input name="sourceUrl" placeholder="internal storage path" style={inputStyle} /></Col>
        <Col label="Extraction">
          <select name="extractionStatus" style={inputStyle} defaultValue="not_started">
            {POLICY_DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </Col>
        <Col label="Summary"><input name="summary" placeholder="Coverage and exclusions" style={inputStyle} /></Col>
        <Col label="Effective from"><input name="effectiveFrom" type="date" style={inputStyle} /></Col>
        <Col label="Effective to"><input name="effectiveTo" type="date" style={inputStyle} /></Col>
        <Col label="Extracted text"><textarea name="rawText" rows={2} placeholder="Optional clause text" style={inputStyle} /></Col>
        <button disabled={pending} style={buttonStyle}>{pending ? 'Adding...' : 'Add document'}</button>
      </form>
      <ActionNote state={state} />
    </Card>
  );
}

function RulesetForm({ policy }: { policy: ClientPolicyRow }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(createRulesetAction, undefined);
  return (
    <Card>
      <form action={action} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <input type="hidden" name="clientId" value={policy.client_id} />
        <input type="hidden" name="policyId" value={policy.id} />
        <Col label="Version"><input name="version" required placeholder="v1" style={inputStyle} /></Col>
        <Col label="Status">
          <select name="status" style={inputStyle} defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="client_attested">Client attested</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Col>
        <Col label="Effective from"><input name="effectiveFrom" type="date" style={inputStyle} /></Col>
        <Col label="Effective to"><input name="effectiveTo" type="date" style={inputStyle} /></Col>
        <button disabled={pending} style={buttonStyle}>{pending ? 'Creating...' : 'Create ruleset'}</button>
      </form>
      <ActionNote state={state} />
    </Card>
  );
}

function PolicyRuleForm({
  policy,
  documents,
  rulesets,
}: {
  policy: ClientPolicyRow;
  documents: PolicyDocumentRow[];
  rulesets: PolicyRulesetRow[];
}) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(addRuleAction, undefined);
  const defaultCondition = JSON.stringify({ declaredValueGte: 5000, insuredValueLtDeclared: true }, null, 2);
  const defaultAction = JSON.stringify({
    decision: 'BLOCK',
    message: 'Declared value exceeds insured value for this policy.',
    suggestedFix: 'Confirm third-party insurance or reduce declared value before label purchase.',
  }, null, 2);

  return (
    <Card>
      <form action={action} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, alignItems: 'end' }}>
        <input type="hidden" name="clientId" value={policy.client_id} />
        <input type="hidden" name="policyId" value={policy.id} />
        <Col label="Ruleset">
          <select name="rulesetId" required style={inputStyle} defaultValue={rulesets[0]?.id || ''}>
            <option value="">Select ruleset</option>
            {rulesets.map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.version} / {ruleset.status}</option>)}
          </select>
        </Col>
        <Col label="Source document">
          <select name="documentId" style={inputStyle} defaultValue="">
            <option value="">None</option>
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.file_name}</option>)}
          </select>
        </Col>
        <Col label="Rule key"><input name="ruleKey" required defaultValue="underinsured_high_value" style={inputStyle} /></Col>
        <Col label="Category"><input name="category" required defaultValue="UNDER_INSURED_SHIPMENT" style={inputStyle} /></Col>
        <Col label="Severity">
          <select name="severity" style={inputStyle} defaultValue="block">
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="block">Block</option>
          </select>
        </Col>
        <Col label="Status">
          <select name="status" style={inputStyle} defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="client_attested">Client attested</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Col>
        <Col label="Clause ref"><input name="clauseRef" placeholder="Policy Sec. 4.2" style={inputStyle} /></Col>
        <div />
        <Col label="Condition JSON"><textarea name="conditionJson" required defaultValue={defaultCondition} rows={8} style={inputStyle} /></Col>
        <Col label="Action JSON"><textarea name="actionJson" required defaultValue={defaultAction} rows={8} style={inputStyle} /></Col>
        <button disabled={pending || rulesets.length === 0} style={buttonStyle}>{pending ? 'Adding...' : 'Add rule'}</button>
      </form>
      <ActionNote state={state} />
    </Card>
  );
}

function BacktestForm({ policy, rulesets }: { policy: ClientPolicyRow; rulesets: PolicyRulesetRow[] }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(runBacktestAction, undefined);
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setMonth(start.getMonth() - 12);

  return (
    <Card>
      <form action={action} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <input type="hidden" name="clientId" value={policy.client_id} />
        <input type="hidden" name="policyId" value={policy.id} />
        <Col label="Ruleset">
          <select name="rulesetId" required style={inputStyle} defaultValue={rulesets[0]?.id || ''}>
            <option value="">Select ruleset</option>
            {rulesets.map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.version} / {ruleset.status}</option>)}
          </select>
        </Col>
        <Col label="Period start"><input name="periodStart" required type="date" defaultValue={start.toISOString().slice(0, 10)} style={inputStyle} /></Col>
        <Col label="Period end"><input name="periodEnd" required type="date" defaultValue={end} style={inputStyle} /></Col>
        <button disabled={pending || rulesets.length === 0} style={buttonStyle}>{pending ? 'Running...' : 'Run backtest'}</button>
      </form>
      <ActionNote state={state} />
    </Card>
  );
}

function DocumentTable({ documents }: { documents: PolicyDocumentRow[] }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Effective</th><th>Summary</th></tr></thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.file_name}</td>
              <td>{doc.document_type}</td>
              <td><Badge color={doc.extraction_status === 'reviewed' ? 'green' : 'amber'}>{doc.extraction_status}</Badge></td>
              <td className="mono" style={{ fontSize: 11 }}>{formatRange(doc.effective_from, doc.effective_to)}</td>
              <td>{doc.summary || <span style={{ color: 'var(--ink-faint)' }}>No summary</span>}</td>
            </tr>
          ))}
          {documents.length === 0 && <tr><td colSpan={5}><ConsoleEmptyState icon="book" heading="No documents" description="Add metadata for policies, riders, SOPs, and email exceptions." /></td></tr>}
        </tbody>
      </table>
      <TableFooter showing={documents.length} total={documents.length} label="documents" />
    </Card>
  );
}

function RulesetTable({ policyId, rulesets }: { policyId: string; rulesets: PolicyRulesetRow[] }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead><tr><th>Version</th><th>Status</th><th>Effective</th><th>Rules</th><th>Created</th></tr></thead>
        <tbody>
          {rulesets.map((ruleset) => (
            <tr key={ruleset.id}>
              <td><Link href={`/policies/${policyId}/rules`} style={{ color: 'var(--blue-ink)', textDecoration: 'none' }}>{ruleset.version}</Link></td>
              <td><StatusBadge status={ruleset.status} /></td>
              <td className="mono" style={{ fontSize: 11 }}>{formatRange(ruleset.effective_from, ruleset.effective_to)}</td>
              <td className="mono">{ruleset.rule_count}</td>
              <td className="mono" style={{ fontSize: 11 }}>{dateOnly(ruleset.created_at)}</td>
            </tr>
          ))}
          {rulesets.length === 0 && <tr><td colSpan={5}><ConsoleEmptyState icon="grid" heading="No rulesets" description="Create a draft ruleset before adding structured policy rules." /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function RulesTable({ rules, rulesets }: { rules: PolicyRuleRow[]; rulesets: PolicyRulesetRow[] }) {
  const names = Object.fromEntries(rulesets.map((r) => [r.id, r.version]));
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead><tr><th>Rule</th><th>Ruleset</th><th>Category</th><th>Decision</th><th>Status</th><th>Clause</th></tr></thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>
                <div style={{ fontWeight: 700 }}>{rule.rule_key}</div>
                <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 10.5, color: 'var(--ink-faint)' }}>{JSON.stringify(rule.condition_json)}</pre>
              </td>
              <td>{names[rule.ruleset_id] || rule.ruleset_id}</td>
              <td>{rule.category}</td>
              <td><Badge color={rule.action_json.decision === 'BLOCK' ? 'hot' : 'amber'}>{rule.action_json.decision}</Badge></td>
              <td><StatusBadge status={rule.status} /></td>
              <td>{rule.clause_ref || <span style={{ color: 'var(--ink-faint)' }}>None</span>}</td>
            </tr>
          ))}
          {rules.length === 0 && <tr><td colSpan={6}><ConsoleEmptyState icon="shield" heading="No structured rules" description="Add rules that convert policy language into IF/THEN controls." /></td></tr>}
        </tbody>
      </table>
      <TableFooter showing={rules.length} total={rules.length} label="rules" />
    </Card>
  );
}

function BacktestTable({ runs }: { runs: PolicyBacktestRunRow[] }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead><tr><th>Run</th><th>Status</th><th>Period</th><th>Checked</th><th>Violations</th><th>Loss</th><th>Exposure</th></tr></thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="mono">{run.id}</td>
              <td><Badge color={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'hot' : 'amber'}>{run.status}</Badge></td>
              <td className="mono" style={{ fontSize: 11 }}>{formatRange(run.period_start, run.period_end)}</td>
              <td className="mono">{run.shipments_checked}</td>
              <td className="mono">{run.violations_found}</td>
              <td className="mono">{usd(run.preventable_margin_loss)}</td>
              <td className="mono">{usd(run.uninsured_exposure)}</td>
            </tr>
          ))}
          {runs.length === 0 && <tr><td colSpan={7}><ConsoleEmptyState icon="clock" heading="No backtests" description="Run a ruleset against historical audit and insurance data." /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function BacktestResultsTable({ results }: { results: PolicyBacktestResultRow[] }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead><tr><th>Decision</th><th>Category</th><th>Message</th><th>Loss</th><th>Exposure</th><th>Source</th></tr></thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id}>
              <td><Badge color={result.decision === 'BLOCK' ? 'hot' : 'amber'}>{result.decision}</Badge></td>
              <td>{result.category}</td>
              <td>
                <div>{result.message}</div>
                {result.suggested_fix && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{result.suggested_fix}</div>}
              </td>
              <td className="mono">{usd(result.preventable_loss)}</td>
              <td className="mono">{usd(result.uninsured_exposure)}</td>
              <td className="mono" style={{ fontSize: 11 }}>{result.shipment_id || result.audit_result_id || result.invoice_id || 'context'}</td>
            </tr>
          ))}
          {results.length === 0 && <tr><td colSpan={6}><ConsoleEmptyState icon="check" heading="No violations sampled" description="The latest run has no stored policy violations yet." /></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

// ── Attestation panel ─────────────────────────────────────────────

function AttestationPanel({
  policyId,
  rulesets,
}: {
  policyId: string;
  rulesets: PolicyRulesetRow[];
}) {
  if (rulesets.length === 0) return null;

  return (
    <>
      <SectionLabel>Ratification &amp; attestation</SectionLabel>
      {rulesets.map((ruleset) => {
        const isDraft = ruleset.status === 'draft';
        const isAttested = ruleset.status === 'client_attested';
        const isActive = ruleset.status === 'active';
        const isArchived = ruleset.status === 'archived';

        return (
          <Card key={ruleset.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Ruleset {ruleset.version}</span>
                  <StatusBadge status={ruleset.status} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
                  Effective: {formatRange(ruleset.effective_from, ruleset.effective_to)} / {ruleset.rule_count} rules
                </div>
              </div>
            </div>

            {isDraft && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
                  Awaiting client attestation — the client (or broker) must confirm the digitization
                  accurately reflects their policy document before activation.
                </div>
                <AttestationForm rulesetId={ruleset.id} policyId={policyId} />
              </div>
            )}

            {isAttested && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
                  Attested by <strong>{ruleset.reviewed_by || 'Unknown'}</strong>
                  {ruleset.activated_at ? ` on ${dateOnly(ruleset.activated_at)}` : ''}.
                  Ready for activation.
                </div>
                <ActivationButton rulesetId={ruleset.id} policyId={policyId} />
              </div>
            )}

            {isActive && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 12, color: 'var(--ink-2)' }}>
                Active{ruleset.activated_at ? ` since ${dateOnly(ruleset.activated_at)}` : ''}
                {ruleset.reviewed_by ? ` / attested by ${ruleset.reviewed_by}` : ''}.
                Rules are live in backtests and gateway precheck.
              </div>
            )}

            {isArchived && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 12, color: 'var(--ink-2)' }}>
                Archived{ruleset.archived_at ? ` on ${dateOnly(ruleset.archived_at)}` : ''}.
                This ruleset is no longer active.
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function AttestationForm({ rulesetId, policyId }: { rulesetId: string; policyId: string }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(attestRulesetAction, undefined);
  return (
    <form action={action} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
      <input type="hidden" name="rulesetId" value={rulesetId} />
      <input type="hidden" name="policyId" value={policyId} />
      <Col label="Attested by (name / email)">
        <input name="attestedBy" required placeholder="broker@client.com" style={inputStyle} />
      </Col>
      <Col label="Notes (optional)">
        <input name="attestationNotes" placeholder="Confirmed via email on..." style={inputStyle} />
      </Col>
      <button disabled={pending} style={buttonStyle}>{pending ? 'Recording...' : 'Record attestation'}</button>
      <ActionNote state={state} />
    </form>
  );
}

function ActivationButton({ rulesetId, policyId }: { rulesetId: string; policyId: string }) {
  const [state, action, pending] = useActionState<PolicyActionState, FormData>(activateRulesetAction, undefined);
  return (
    <form action={action} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="rulesetId" value={rulesetId} />
      <input type="hidden" name="policyId" value={policyId} />
      <button
        type="submit"
        disabled={pending}
        style={{
          ...buttonStyle,
          background: 'oklch(0.55 0.18 160)',
          color: '#fff',
        }}
      >
        {pending ? 'Activating...' : 'Activate ruleset'}
      </button>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
        All rules will become active and live in backtests.
      </span>
      <ActionNote state={state} />
    </form>
  );
}

// ── Scope statement ───────────────────────────────────────────────

function ScopeStatement({
  policy,
  rulesets,
  rules,
}: {
  policy: ClientPolicyRow;
  rulesets: PolicyRulesetRow[];
  rules: PolicyRuleRow[];
}) {
  if (rules.length === 0) return null;

  const activeRules = rules.filter((r) => r.status === 'active');
  const categories = activeRules.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});

  const activeRuleset = rulesets.find((rs) => rs.status === 'active');

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Scope Statement</h3>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
          Client: {policy.client_name || policy.client_id}
        </div>
      </div>

      {/* In scope */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--green-ink)' }}>
          In scope — {activeRules.length} active control{activeRules.length !== 1 ? 's' : ''}
        </div>
        {activeRules.length > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            {Object.entries(categories).map(([cat, count]) => (
              <div key={cat} style={{ marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span>: {count} rule{count !== 1 ? 's' : ''}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
            No active rules yet. Rules become active after client attestation and staff activation.
          </div>
        )}
      </div>

      {/* Out of scope */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--ink-3)' }}>
          Out of scope — not enforced
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          <div>Ambiguous terms (e.g., &ldquo;commercially reasonable packaging&rdquo;) — not digitized</div>
          <div>Non-operational clauses (premium, notice, subrogation, deductibles, cancellation)</div>
          <div>Unmapped operational clauses — tracked as taxonomy-discovery candidates</div>
        </div>
      </div>

      {/* Effective period */}
      {activeRuleset && (
        <div style={{ fontSize: 12, color: 'var(--ink-2)', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <strong>Effective period:</strong>{' '}
          {formatRange(activeRuleset.effective_from, activeRuleset.effective_to)}
        </div>
      )}

      {/* Attestation status */}
      {activeRuleset?.reviewed_by && (
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          <strong>Attested by:</strong>{' '}
          {activeRuleset.reviewed_by}
          {activeRuleset.activated_at ? ` on ${dateOnly(activeRuleset.activated_at)}` : ''}
        </div>
      )}
    </Card>
  );
}

// ── Guarantee card ────────────────────────────────────────────────

function GuaranteeCard() {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Governance guarantee</h3>
      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
        We guarantee that the operational controls you have confirmed are enforced by the Gateway
        exactly as confirmed, and that every shipment decision is logged. We do not guarantee
        insurance coverage.
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
        The Gateway enforces operational shipping controls; it is not insurance, not insurance
        advice, and does not guarantee claim coverage. Coverage determinations rest with your insurer.
      </div>
    </Card>
  );
}

function Col({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><span style={labelStyle}>{label}</span>{children}</label>;
}

function ActionNote({ state }: { state: PolicyActionState }) {
  if (!state) return null;
  return (
    <div style={{ marginTop: 10, fontSize: 12, color: state.ok ? 'var(--green-ink)' : 'oklch(0.84 0.10 25)' }}>
      {state.ok ? state.message || 'Saved.' : state.error}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active' ? 'green' :
    status === 'client_attested' ? 'blue' :
    status === 'archived' ? 'neutral' :
    'amber';
  return <Badge color={color}>{status}</Badge>;
}

function formatRange(from?: string | null, to?: string | null) {
  return `${from || 'open'} -> ${to || 'open'}`;
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function usd(value: number) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const buttonStyle: React.CSSProperties = {
  background: 'var(--blue)',
  color: 'oklch(0.16 0.02 244)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
