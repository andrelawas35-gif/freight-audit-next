/*
  app/clients/page.tsx — Client gain-share portfolio.
  
  Replace with your screen_clients.jsx UI.
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD } from '@/lib/format';

export const dynamic = 'force-dynamic';


export default async function ClientsPage() {
  let clients: any[] = [];

  try {
    clients = await fetchRecords('Clients', {
  maxRecords: 50,
});
  } catch (err) {
    console.error('Failed to fetch clients:', err);
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Client</th>
              <th>Gain share</th>
              <th>Active</th>
              <th>Last audit</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c['Company name'] || '—'}</td>
                <td className="mono">{c['Gain share pct'] ? c['Gain share pct'] + '%' : '—'}</td>
                <td>
                  <span style={{
                    width: 8, height: 8, borderRadius: 4, display: 'inline-block',
                    background: c['Contract active'] ? 'var(--green)' : 'var(--ink-faint)',
                  }} />
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {c['Last audit run'] || '—'}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>
                  No clients. Add your first client in Airtable.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
