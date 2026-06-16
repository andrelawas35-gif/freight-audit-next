/*
  app/carriers/page.tsx — Carrier Scorecards.
  
  Pulls carrier data + dispute stats to build scorecards.
  Replace the table below with your screen_carriers.jsx sparklines and heatmap.
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD, fmtPct } from '@/lib/format';
import { Card, KPI, Ticker, SectionLabel, Sparkline, CarrierMark, RuleTag } from '@/components/ui/primitives';
import { Carrier, Dispute } from '@/lib/types';


export const dynamic = 'force-dynamic';

export default async function CarriersPage() {
  let carriers: any[] = [];
  let disputes: any[] = [];
  

// [ADDED] Parallel fetching
  try {
    const [carriersData, disputesData] = await Promise.all([
      fetchRecords('Carriers', { maxRecords: 20 }),
      fetchRecords('Disputes', {
        maxRecords: 500,
        fields: ['Status', 'Disputed amount', 'Recovery amount', 'Opened date', 'Carrier'],
      })
    ]);
    
    carriers = carriersData as Carrier[]; // [ADDED] Type casting
    disputes = disputesData as Dispute[]; // [ADDED] Type casting
  } catch (err) {
    console.error('Failed to fetch Airtable data:', err); // [ADDED] Unified error handling
  }
  
 // ── [PLACE THE SCORECARD CALCULATION HERE] ──────────────────────
  const scorecards = carriers.map(c => {
    // Logic to filter disputes for this carrier
    const cDisputes = disputes.filter(d => {
       // Logic: Check if dispute is linked to this carrier
       // (Example: if your Disputes have a carrier record ID)
       return true; 
    });
    
    const totalRecovered = cDisputes.reduce((a, b) => a + (b['Recovery amount'] || 0), 0);
    const winRate = cDisputes.filter(d => d['Status'] === 'Won').length / Math.max(1, cDisputes.length);

    return {
      id: c.id,
      scac: c.SCAC || '??',
      name: c['Carrier name'] || 'Unknown',
      totalRecovered,
      openExposure: cDisputes.reduce((a, b) => a + (b['Disputed amount'] || 0), 0) - totalRecovered,
      winRate,
      findings: cDisputes.length,
      trend: [10, 15, 8, 20, 25, 30, 28, 40, 35, 45, 50, 48]
    };
  });

  const totalRecovered = scorecards.reduce((a, b) => a + b.totalRecovered, 0);

  // ── [THEN RETURN YOUR JSX HERE] ─────────────────────────────────
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1340, margin: '0 auto' }}>
      <KPI 
        label="Total Recovered" 
        tone="green" 
        accentBar="var(--green)"
        value={<Ticker value={totalRecovered} format={fmtUSD} />} 
        sub={`Across ${carriers.length} carriers`}
      />
      <Card pad={0}>
        <SectionLabel>Per-Carrier Scorecard</SectionLabel>
        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            {scorecards.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.scac}</td>
                <td>{fmtUSD(s.totalRecovered)}</td>
                <td>{fmtUSD(s.openExposure)}</td>
                <td>{(s.winRate * 100).toFixed(2)}%</td>
                <td>{s.findings}</td>
              </tr>
            ))}
        </table>
      </Card>
    </div>
  );

  

}
