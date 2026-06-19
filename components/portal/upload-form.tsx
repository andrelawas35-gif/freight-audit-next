'use client';

import { useActionState } from 'react';
import { uploadShipments, type UploadResult } from '@/app/(portal)/portal/upload/actions';

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadResult | undefined, FormData>(
    uploadShipments,
    undefined
  );

  return (
    <form action={formAction}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: 20,
        }}
      >
        <label
          htmlFor="file"
          style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}
        >
          Shipment CSV file
        </label>
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
            background: 'var(--blue)',
            color: 'oklch(0.16 0.02 244)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '9px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? 'Uploading…' : 'Upload & stage'}
        </button>
      </div>

      {state && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 'var(--radius-sm)',
            padding: '11px 14px',
            fontSize: 12.5,
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
            </>
          ) : (
            state.error
          )}
        </div>
      )}
    </form>
  );
}
