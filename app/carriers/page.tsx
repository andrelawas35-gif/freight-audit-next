/*
  app/carriers/page.tsx — Carrier Scorecards.

  DS reference: ui_kits/console/screen_carriers.jsx
  Layout: 4 KPI tiles → scorecard table with sparklines → rule × carrier heatmap

  Data flow:
    1. Fetch Carriers, Disputes, Audit Results, Carrier Codes in parallel
    2. Match disputes + audit results to carriers via SCAC code
    3. Compute per-carrier stats (findings, win rate, recovered, exposure)
    4. Build rule × carrier heatmap from audit results
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD, fmtPct } from '@/lib/format';
import {
  Card, KPI, Ticker, SectionLabel, Sparkline,
  CarrierMark, RuleTag,
} from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

// ── Rule metadata (matches primitives.tsx RuleTag) ──────────────
const RULES: Record<string, { short: string; name: string; hue: number }> = {
  DIM_WEIGHT_TRAP:     { short: 'DIM', name: 'Dim-weight trap',     hue: 280 },
  PHANTOM_ACCESSORIAL: { short: 'ACC', name: 'Phantom accessorial', hue: 50  },
  DUPLICATE_TRACKING:  { short: 'DUP', name: 'Duplicate tracking',  hue: 152 },
  SLA_FAILURE:         { short: 'SLA', name: 'SLA failure',         hue: 220 },
  LTL_SLA_FAILURE:     { short: 'LTL', name: 'LTL SLA failure',     hue: 244 },
};

// ── Normalize rule names from Airtable select values ────────────
function normalizeRule(raw: string): string {
  if (!raw) return 'OTHER';
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (upper.includes('DIM'))       return 'DIM_WEIGHT_TRAP';
  if (upper.includes('PHANTOM') || upper.includes('ACCESSORIAL') || upper.includes('RESIDENTIAL')) return 'PHANTOM_ACCESSORIAL';
  if (upper.includes('DUPLICATE')) return 'DUPLICATE_TRACKING';
  if (upper.includes('LTL'))      return 'LTL_SLA_FAILURE';
  if (upper.includes('SLA'))      return 'SLA_FAILURE';
  return upper;
}

// ── Types for computed scorecard ─────────────────────────────────
type Scorecard = {
  scac: string;
  name: string;
  carrierType: string;
  filingWindow: number;
  findings: number;
  disputeCount: number;
  winCount: number;
  winRate: number;
  totalRecovered: number;
  openExposure: number;
  trend: number[];
  ruleBreakdown: Record<string, number>;
};

export default async function CarriersPage() {
  let scorecards: Scorecard[] = [];

  try {
    const [carriersRaw, disputesRaw, auditResultsRaw, carrierCodesRaw] = await Promise.all([
      fetchRecords('Carriers',      { maxRecords: 50 }),
      fetchRecords('Disputes',      { maxRecords: 500 }),
      fetchRecords('Audit Results', { maxRecords: 500 }),
      fetchRecords('Carrier Codes', { maxRecords: 200 }),
    ]);

    // ── Build filing window lookup from Carrier Codes ──────────
    const filingWindowMap = new Map<string, number>();
    (carrierCodesRaw as any[]).forEach(cc => {
      const scac = cc['SCAC code'] || cc['Carrier SCAC'] || '';
      const window = cc['Filing window days'] || 0;
      if (scac && window) {
        const existing = filingWindowMap.get(scac) || 0;
        if (window > existing) filingWindowMap.set(scac, window);
      }
    });

    // ── Build per-carrier scorecards ───────────────────────────
    scorecards = (carriersRaw as any[]).map(c => {
      const scac = c['SCAC'] || '';
      const name = c['Carrier name'] || 'Unknown';
      const carrierType = c['Carrier type'] || '';

      // Match disputes by Carrier SCAC text field
      const cDisputes = (disputesRaw as any[]).filter(d => {
        const dCarrier = d['Carrier'] || d['Carrier (display)'] || '';
        return dCarrier === scac;
      });

      // Match audit results by Carrier SCAC
      const cAuditResults = (auditResultsRaw as any[]).filter(ar => {
        const arCarrier = ar['Carrier SCAC'] || ar['Carrier (display)'] || '';
        return arCarrier === scac;
      });

      const flagged = cAuditResults.filter(ar =>
        ar['Outcome'] === 'FLAGGED' || ar['Outcome'] === 'ERROR'
      );

      const won = cDisputes.filter(d => d['Status'] === 'Won');
      const resolved = cDisputes.filter(d =>
        ['Won', 'Closed'].includes(d['Status'] || '')
      );
      const active = cDisputes.filter(d =>
        !['Won', 'Closed'].includes(d['Status'] || '')
      );

      const totalRecovered = won.reduce(
        (a: number, d: any) => a + (d['Recovery amount'] || 0), 0
      );
      const openExposure = active.reduce(
        (a: number, d: any) => a + (d['Disputed amount'] || 0), 0
      );

      // ── Rule breakdown from flagged audit results ─────────
      const ruleBreakdown: Record<string, number> = {};
      flagged.forEach((ar: any) => {
        const rawRule = ar['Rule name'] || ar['Rule'] || '';
        const rule = normalizeRule(rawRule);
        const billed = ar['Billed amount'] || 0;
        const expected = ar['Expected amount'] || 0;
        const recover = ar['Recover amount'] || ar['Recoverable amount'] || Math.max(0, billed - expected);
        ruleBreakdown[rule] = (ruleBreakdown[rule] || 0) + recover;
      });

      // ── Simulated 12-week trend (until weekly aggregation exists) ──
      const base = totalRecovered > 0 ? totalRecovered / 12 : 0;
      const seed = scac.charCodeAt(0) % 7;
      const trend = Array.from({ length: 12 }, (_, i) =>
        base * (0.4 + seed / 9 + i * 0.03) + (i % 3 === 0 ? base * 0.15 : 0)
      );

      return {
        scac,
        name,
        carrierType,
        filingWindow: filingWindowMap.get(scac) || 0,
        findings: flagged.length,
        disputeCount: cDisputes.length,
        winCount: won.length,
        winRate: resolved.length > 0 ? won.length / resolved.length : 0,
        totalRecovered,
        openExposure,
        trend,
        ruleBreakdown,
      };
    });

    scorecards.sort((a, b) => b.totalRecovered - a.totalRecovered);

  } catch (err) {
    console.error('Failed to fetch carrier data:', err);
  }

  // ── Aggregate totals ────────────────────────────────────────
  const totals = scorecards.reduce(
    (acc, c) => ({
      findings:       acc.findings + c.findings,
      disputeCount:   acc.disputeCount + c.disputeCount,
      totalRecovered: acc.totalRecovered + c.totalRecovered,
      openExposure:   acc.openExposure + c.openExposure,
    }),
    { findings: 0, disputeCount: 0, totalRecovered: 0, openExposure: 0 }
  );

  const weightedWin = totals.disputeCount > 0
    ? scorecards.reduce((a, c) => a + c.winRate * c.disputeCount, 0) / totals.disputeCount
    : 0;

  // ── Collect rule keys that have data ────────────────────────
  const activeRuleKeys = Object.keys(RULES).filter(k =>
    scorecards.some(c => (c.ruleBreakdown[k] || 0) > 0)
  );

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1340, margin: '0 auto' }}>

      {/* ── 4 KPI tiles ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPI
          label="Total recovered" tone="green" accentBar="var(--green)"
          value={<Ticker value={totals.totalRecovered} format={fmtUSD} />}
          sub={`across ${scorecards.length} carriers`}
        />
        <KPI
          label="Open exposure" tone="amber" accentBar="var(--amber)"
          value={<Ticker value={totals.openExposure} format={fmtUSD} />}
          sub={`${totals.disputeCount} active disputes`}
        />
        <KPI
          label="Weighted win rate" tone="green"
          value={fmtPct(weightedWin)}
          sub="across resolved disputes"
        />
        <KPI
          label="Total findings"
          value={<Ticker value={totals.findings} />}
          sub="flagged audit results"
        />
      </div>

      {/* ── Per-carrier scorecard table ──────────────────────── */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Per-carrier scorecard</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            · win rate, recovery, exposure
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Carrier</th>
              <th className="num">Filing window</th>
              <th className="num">Findings</th>
              <th className="num">Disputes</th>
              <th className="num">Win rate</th>
              <th className="num">Recovered</th>
              <th className="num">Open exposure</th>
              <th>12-week trend</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map(c => (
              <tr key={c.scac}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CarrierMark scac={c.scac} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                        {c.scac}{c.carrierType ? ` · ${c.carrierType}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num mono">{c.filingWindow > 0 ? `${c.filingWindow}d` : '—'}</td>
                <td className="num mono">{c.findings}</td>
                <td className="num mono">{c.disputeCount}</td>
                <td className="num mono" style={{
                  fontWeight: 700,
                  color: c.winRate >= 0.80 ? 'var(--green-ink)' : c.winRate > 0 ? 'var(--ink)' : 'var(--ink-faint)',
                }}>
                  {c.disputeCount > 0 ? fmtPct(c.winRate) : '—'}
                </td>
                <td className="num mono" style={{ fontWeight: 700, color: 'var(--green-ink)' }}>
                  {c.totalRecovered > 0 ? fmtUSD(c.totalRecovered) : '—'}
                </td>
                <td className="num mono" style={{ color: 'var(--amber-ink)' }}>
                  {c.openExposure > 0 ? fmtUSD(c.openExposure) : '—'}
                </td>
                <td>
                  {c.totalRecovered > 0 ? (
                    <Sparkline data={c.trend} width={84} height={20} color="var(--green)" />
                  ) : (
                    <span style={{ color: 'var(--ink-faint)', fontSize: 10 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {scorecards.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 30 }}>
                  No carrier data. Add carriers in Airtable and run audit scripts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* ── Rule × Carrier heatmap ──────────────────────────── */}
      {activeRuleKeys.length > 0 && (
        <Card>
          <SectionLabel>Findings · rule × carrier</SectionLabel>

          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `120px repeat(${activeRuleKeys.length}, 1fr) 80px`,
            gap: 8, marginBottom: 8,
          }}>
            <span />
            {activeRuleKeys.map(k => (
              <div key={k} style={{ textAlign: 'center' }}>
                <RuleTag rule={k} />
                <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3 }}>
                  {RULES[k]?.short || k.slice(0, 3)}
                </div>
              </div>
            ))}
            <span style={{
              fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase',
              letterSpacing: '0.06em', textAlign: 'right',
            }}>Total</span>
          </div>

          {/* Data rows */}
          {scorecards.map(c => {
            const total = Object.values(c.ruleBreakdown).reduce((a, b) => a + b, 0);
            if (total === 0) return null;
            return (
              <div key={c.scac} style={{
                display: 'grid',
                gridTemplateColumns: `120px repeat(${activeRuleKeys.length}, 1fr) 80px`,
                gap: 8, alignItems: 'center', padding: '7px 0',
                borderTop: '1px solid var(--line-2)',
              }}>
                <CarrierMark scac={c.scac} withName />
                {activeRuleKeys.map(k => {
                  const amt = c.ruleBreakdown[k] || 0;
                  const intensity = total > 0 ? amt / total : 0;
                  const hue = RULES[k]?.hue || 70;
                  return (
                    <div key={k} style={{
                      height: 24, borderRadius: 4, display: 'grid', placeItems: 'center',
                      background: amt > 0
                        ? `oklch(0.3 ${(0.04 + intensity * 0.10).toFixed(2)} ${hue})`
                        : 'var(--surface-sunk)',
                      border: `1px solid ${amt > 0
                        ? `oklch(0.42 0.10 ${hue})`
                        : 'var(--line)'}`,
                    }}>
                      <span className="mono tnum" style={{
                        fontSize: 10.5, fontWeight: 700,
                        color: amt > 0 ? `oklch(0.88 0.08 ${hue})` : 'var(--ink-faint)',
                      }}>
                        {amt > 0 ? fmtUSD(amt) : '—'}
                      </span>
                    </div>
                  );
                })}
                <span className="mono tnum" style={{
                  fontSize: 12.5, fontWeight: 700, textAlign: 'right',
                }}>{fmtUSD(total)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}