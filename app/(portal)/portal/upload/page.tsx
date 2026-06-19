/*
  app/(portal)/portal/upload/page.tsx — client data upload + history log.
*/

import { auth } from '@/auth';
import { UploadForm } from '@/components/portal/upload-form';
import { listUploads, type UploadLog } from '@/lib/ingestion/uploads';

export const metadata = { title: 'Upload data · Aurelian Collective' };
export const dynamic = 'force-dynamic';

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function UploadPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;

  let history: UploadLog[] = [];
  if (clientId) {
    try {
      history = await listUploads(clientId, 20);
    } catch (err) {
      console.error('Upload history load failed:', err);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>Upload shipment data</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        Upload a CSV export from your WMS or shipping platform. We match it against carrier
        invoices to find overcharges.
      </p>

      <UploadForm />

      {/* Upload history / audit trail */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Upload history</h2>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th className="num">Rows</th>
                <th className="num">Staged</th>
                <th className="num">Health</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((u) => (
                <tr key={u.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{fmtWhen(u.created_at)}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.file_name || '—'}
                  </td>
                  <td className="num mono">{u.rows}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{u.staged}</td>
                  <td className="num mono" style={{
                    color: u.data_health >= 80 ? 'var(--green-ink)' : u.data_health >= 50 ? 'var(--amber-ink)' : 'var(--ink-3)',
                  }}>
                    {u.staged > 0 ? `${u.data_health}%` : '—'}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: u.status === 'ok' ? 'var(--green-ink)'
                           : u.status === 'partial' ? 'var(--amber-ink)'
                           : 'var(--ink-3)',
                    }}>
                      {u.status === 'ok' ? 'Processed' : u.status === 'partial' ? 'Partial' : 'No rows'}
                    </span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
                    No uploads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: 'var(--ink-2)' }}>
          Accepted columns
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Headers are matched flexibly (case-insensitive). Include at least a{' '}
          <strong>tracking number</strong> or <strong>PRO number</strong>. Other recognized
          columns: carrier, weight, length, width, height, origin zip, destination zip,
          address type, service level, ship date, reference/order number. Use the{' '}
          <strong>Download template</strong> button above for a ready-made file.
        </p>
      </section>
    </div>
  );
}
