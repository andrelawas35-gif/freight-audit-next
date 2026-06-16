/*
  app/carriers/page.tsx — Carrier Scorecards.
  
  Pulls carrier data + dispute stats to build scorecards.
  Replace the table below with your screen_carriers.jsx sparklines and heatmap.
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CarriersPage() {
  let carriers: any[] = [];
  let disputes: any[] = [];

try {
    carriers = await fetchRecords('Carriers', { maxRecords: 20 });
  } catch (err) {
    console.error('Failed to fetch carriers:', err);
  }

  try {
    disputes = await fetchRecords('Disputes', {
      maxRecords: 500,
      fields: ['Status', 'Disputed amount', 'Recovery amount', 'Opened date'],
    });
  } catch (err) {
    console.error('Failed to fetch disputes for carriers:', err);
  }
  
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1340, margin: '0 auto' }}>
     
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {carriers.map((c) => (
          <div key={c.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center',
                background: 'var(--surface-sunk)', fontSize: 10, fontWeight: 700, color: 'var(--ink-2)',
                fontFamily: 'var(--mono)',
              }}>{(c['SCAC'] || '??').slice(0, 2)}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c['Carrier name'] || 'Unknown'}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{c['SCAC'] || '—'}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Contact: {c['Contact email'] || '—'}
            </div>
          </div>
        ))}
        {carriers.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            No carriers found. Add carriers to your Airtable Carriers table.
          </div>
        )}
      </div>
    </div>
  );
}
