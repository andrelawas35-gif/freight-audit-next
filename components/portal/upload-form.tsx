'use client';

import { useActionState } from 'react';
import { uploadShipments, type UploadResult } from '@/app/(portal)/portal/upload/actions';

// Clean template matching the recognized headers (see generic-csv.ts)
const TEMPLATE_HEADERS = [
  'Tracking Number', 'PRO Number', 'Reference', 'Carrier', 'Weight',
  'Length', 'Width', 'Height', 'Origin Zip', 'Destination Zip',
  'Address Type', 'Service Level', 'Ship Date',
];
const TEMPLATE_SAMPLE = [
  '1Z999AA10123456784', '', 'PO-1001', 'UPS', '12.5',
  '14', '10', '8', '07105', '90210',
  'Commercial', 'Ground', '2026-06-10',
];

function downloadTemplate() {
  const csv = TEMPLATE_HEADERS.join(',') + '\n' + TEMPLATE_SAMPLE.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aurelian-shipment-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function HealthBar({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'oklch(0.70 0.16 25)';
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4, color: 'var(--ink-2)' }}>
        <span>Data health · rows with usable dimensions</span>
        <span style={{ fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-sunk)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, transition: 'width 0.4s ease' }} />
      </div>
      {pct < 80 && (
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 5 }}>
          Rows missing length/width/height/weight can’t be checked for dim-weight overcharges.
        </div>
      )}
    </div>
  );
}

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadResult | undefined, FormData>(
    uploadShipments,
    undefined
  );

  return (
    <form action={formAction}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <label htmlFor="file" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            Shipment CSV file
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)', padding: '5px 10px',
              fontSize: 11.5, fontWeight: 600, color: 'var(--blue-ink)', cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
            </svg>
            Download template
          </button>
        </div>

        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16, display: 'block' }}
        />

        <button
          type="submit"
          disabled={pending}
          style={{
            background: 'var(--blue)', color: 'oklch(0.16 0.02 244)', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '9px 16px', fontSize: 13, fontWeight: 700,
            cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? 'Uploading…' : 'Upload & stage'}
        </button>
      </div>

      {state && (
        <div
          style={{
            marginTop: 14, borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 12.5,
            background: state.ok ? 'var(--green-soft)' : 'oklch(0.30 0.08 25)',
            border: `1px solid ${state.ok ? 'var(--green-line)' : 'oklch(0.44 0.12 25)'}`,
            color: state.ok ? 'var(--green-ink)' : 'oklch(0.86 0.10 25)',
          }}
        >
          {state.ok ? (
            <>
              Staged <strong>{state.staged}</strong> shipment(s) from {state.rows} row(s).
              {state.skipped ? ` ${state.skipped} skipped (no tracking/PRO).` : ''}
              {state.failed ? ` ${state.failed} failed.` : ''}
              {typeof state.dataHealth === 'number' && <HealthBar pct={state.dataHealth} />}
            </>
          ) : (
            state.error
          )}
        </div>
      )}
    </form>
  );
}
