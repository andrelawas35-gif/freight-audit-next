import { Badge, Card, ConsoleErrorState, ConsoleEmptyState, KPI, SectionLabel, TableFooter } from '@/components/ui/primitives';
import { getGatewayAssessment, listClientOptions } from '@/lib/intelligence/policy-service';

export const dynamic = 'force-dynamic';

export default async function GatewayReadinessPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  try {
    const [assessment, clients] = await Promise.all([
      getGatewayAssessment(clientId, 12),
      listClientOptions(),
    ]);
    const clientName = clients.find((client) => client.id === clientId)?.name || clientId;

    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0 }}>Gateway Readiness</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>{clientName} / last 12 months</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <KPI label="Preventable loss" value={usd(assessment.summary.preventableMarginLoss)} sub="audit + policy signals" tone="amber" />
          <KPI label="Gateway ROI" value={usd(assessment.summary.gatewayRoi)} sub="audit-tagged savings" tone="green" />
          <KPI label="Policy loss" value={usd(assessment.summary.policyBacktestLoss)} sub="latest backtests" />
          <KPI label="Uninsured exposure" value={usd(assessment.summary.uninsuredExposure)} sub="insurance risk" tone="hot" />
        </div>

        <SectionLabel>Preventable audit loss</SectionLabel>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Month</th><th>Category</th><th>Findings</th><th>Margin lost</th><th>Gateway ROI</th></tr></thead>
            <tbody>
              {assessment.readiness.map((row) => (
                <tr key={`${row.month}-${row.gateway_category}`}>
                  <td className="mono">{row.month}</td>
                  <td>{row.gateway_category || 'Uncategorized'}</td>
                  <td className="mono">{row.findings}</td>
                  <td className="mono">{usd(row.margin_lost)}</td>
                  <td className="mono">{usd(row.gateway_roi)}</td>
                </tr>
              ))}
              {assessment.readiness.length === 0 && (
                <tr><td colSpan={5}><ConsoleEmptyState icon="shield" heading="No preventable audit loss yet" description="Run audits with gateway tagging to build this report." /></td></tr>
              )}
            </tbody>
          </table>
          <TableFooter showing={assessment.readiness.length} total={assessment.readiness.length} label="rows" />
        </Card>

        <SectionLabel>Top gateway rule suggestions</SectionLabel>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Category</th><th>Suggestion</th><th>Findings</th><th>ROI</th></tr></thead>
            <tbody>
              {assessment.suggestions.map((row) => (
                <tr key={`${row.gateway_category}-${row.gateway_rule_suggestion}`}>
                  <td>{row.gateway_category || 'Uncategorized'}</td>
                  <td>{row.gateway_rule_suggestion || 'No suggestion'}</td>
                  <td className="mono">{row.findings}</td>
                  <td className="mono">{usd(row.gateway_roi)}</td>
                </tr>
              ))}
              {assessment.suggestions.length === 0 && (
                <tr><td colSpan={4}><ConsoleEmptyState icon="book" heading="No suggestions yet" description="Preventable findings need concrete rule suggestions before this fills in." /></td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <SectionLabel>Insurance exposure</SectionLabel>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Month</th><th>Vertical</th><th>Risk</th><th>Shipments</th><th>Exposed value</th><th>Preventable exposure</th></tr></thead>
            <tbody>
              {assessment.insurance.map((row) => (
                <tr key={`${row.month}-${row.insurance_risk_category}`}>
                  <td className="mono">{row.month}</td>
                  <td>{row.shipper_vertical || 'unknown'}</td>
                  <td>{row.insurance_risk_category}</td>
                  <td className="mono">{row.shipment_count}</td>
                  <td className="mono">{usd(row.exposed_value)}</td>
                  <td className="mono">{usd(row.preventable_exposure)}</td>
                </tr>
              ))}
              {assessment.insurance.length === 0 && (
                <tr><td colSpan={6}><ConsoleEmptyState icon="flag" heading="No insurance exposure rows" description="Add insurance policy findings or run policy backtests for high-value shippers." /></td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <SectionLabel>Latest policy backtests</SectionLabel>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Run</th><th>Status</th><th>Period</th><th>Checked</th><th>Violations</th><th>Loss</th><th>Exposure</th></tr></thead>
            <tbody>
              {assessment.latestBacktests.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{run.id}</td>
                  <td><Badge color={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'hot' : 'amber'}>{run.status}</Badge></td>
                  <td className="mono">{run.period_start} -> {run.period_end}</td>
                  <td className="mono">{run.shipments_checked}</td>
                  <td className="mono">{run.violations_found}</td>
                  <td className="mono">{usd(run.preventable_margin_loss)}</td>
                  <td className="mono">{usd(run.uninsured_exposure)}</td>
                </tr>
              ))}
              {assessment.latestBacktests.length === 0 && (
                <tr><td colSpan={7}><ConsoleEmptyState icon="clock" heading="No policy backtests" description="Create a policy ruleset and run a historical backtest first." /></td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    );
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Gateway readiness failed to load"
        message={err instanceof Error ? err.message : String(err)}
        hint="Confirm the gateway and policy intelligence migrations have been applied."
      />
    );
  }
}

function usd(value: number) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
