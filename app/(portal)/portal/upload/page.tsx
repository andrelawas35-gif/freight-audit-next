/*
  app/(portal)/portal/upload/page.tsx — client data upload + history log.
*/

import { auth } from '@/auth';
import { UploadForm } from '@/components/portal/upload-form';
import { listUploads, type UploadLog } from '@/lib/ingestion/uploads';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/portal/upload-router';

export const metadata = { title: 'Upload data · Aurelian Collective' };
export const dynamic = 'force-dynamic';

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function docTypeLabel(dt: string | undefined): string {
  if (!dt) return '—';
  return DOCUMENT_TYPE_LABELS[dt as DocumentType] || dt;
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
    <div className="portal-upload-page">
      <h1>Upload data</h1>
      <p className="portal-page-subtitle">
        Upload shipment CSVs, insurance policies, carrier contracts, SOPs, or claims history.
      </p>

      <UploadForm />

      {/* Upload history / audit trail */}
      <section className="portal-upload-section">
        <h2>Upload history</h2>
        <div className="portal-table-card portal-table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Type</th>
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
                  <td>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      color: 'rgba(255,255,255,0.4)',
                    }}>
                      {docTypeLabel(u.document_type)}
                    </span>
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
                           : u.status === 'document' ? 'var(--green-ink)'
                           : 'var(--ink-3)',
                    }}>
                      {u.status === 'ok' ? 'Processed'
                       : u.status === 'partial' ? 'Partial'
                       : u.status === 'document' ? 'Received'
                       : 'No rows'}
                    </span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
                    No uploads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="portal-accepted-columns">
        <h2>Accepted file types</h2>
        <p>
          <strong>Shipment CSV</strong> — Headers are matched flexibly (case-insensitive). Include at
          least a tracking number or PRO number. Other recognized columns: carrier, weight, length,
          width, height, origin zip, destination zip, address type, service level, ship date,
          reference/order number. Use the <strong>Download template</strong> button above for a
          ready-made file.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Insurance Policy, Carrier Contract, SOP, Claims History</strong> — Upload your
          documents as PDF, DOCX, TXT, JPG, or PNG. Documents will be routed to AI extraction for
          clause identification, rule mapping, and dispute evidence indexing.
        </p>
      </section>
    </div>
  );
}
