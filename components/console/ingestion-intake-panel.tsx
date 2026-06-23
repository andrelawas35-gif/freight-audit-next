'use client';

import { useActionState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { runConsoleIntake, type IntakeResult } from '@/app/(console)/ingestion/actions';

type ClientOption = { id: string; name: string };

export function IngestionIntakePanel({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<IntakeResult | undefined, FormData>(
    runConsoleIntake,
    undefined
  );

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: 16,
    }}>
      <form action={formAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <Field label="Source">
          <select name="source" defaultValue="wms_csv" disabled={pending} style={inputStyle}>
            <option value="wms_csv">Client WMS CSV</option>
            <option value="tpl_fulfillment">3PL fulfillment CSV</option>
            <option value="tpl_storage">3PL storage CSV</option>
          </select>
        </Field>

        <Field label="Client">
          <select name="clientId" defaultValue="" disabled={pending} style={inputStyle}>
            <option value="">Choose client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Cycle">
          <input name="cycle" placeholder="2026-06" disabled={pending} style={inputStyle} />
        </Field>

        <Field label="Carrier/3PL">
          <input name="carrierScac" placeholder="SCAC" disabled={pending} style={inputStyle} />
        </Field>

        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 36,
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-sunk)',
          color: 'var(--ink-2)',
          fontSize: 12,
          fontWeight: 650,
          padding: '0 12px',
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.65 : 1,
          whiteSpace: 'nowrap',
        }}>
          CSV file
          <input name="file" type="file" accept=".csv,text/csv" disabled={pending} style={{ display: 'none' }} />
        </label>

        <button type="submit" disabled={pending} style={{
          gridColumn: '1 / -1',
          justifySelf: 'start',
          background: 'var(--blue)',
          color: 'oklch(0.16 0.02 244)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: '9px 18px',
          fontSize: 13,
          fontWeight: 750,
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.65 : 1,
        }}>
          {pending ? 'Staging...' : 'Stage selected file'}
        </button>
      </form>

      {state ? (
        <div style={{
          marginTop: 12,
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${state.ok ? 'var(--green-line)' : 'oklch(0.44 0.12 25)'}`,
          background: state.ok ? 'var(--green-soft)' : 'oklch(0.30 0.08 25)',
          color: state.ok ? 'var(--green-ink)' : 'oklch(0.86 0.10 25)',
          padding: '10px 12px',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}>
          {state.ok ? <SuccessMessage result={state} /> : state.error}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 650 }}>{label}</span>
      {children}
    </label>
  );
}

function SuccessMessage({ result }: { result: Extract<IntakeResult, { ok: true }> }) {
  return (
    <>
      Staged <strong>{result.staged}</strong> of <strong>{result.rows}</strong> row(s)
      {result.skipped ? <> with <strong>{result.skipped}</strong> skipped</> : null}
      {result.failed ? <> and <strong>{result.failed}</strong> failed</> : null}
      {result.matched != null ? <>. Match: <strong>{result.matched}</strong> linked, <strong>{result.unmatched ?? 0}</strong> unmatched</> : null}
      {result.dataHealth != null ? <>. Data health: <strong>{result.dataHealth}%</strong></> : null}
    </>
  );
}

const inputStyle: CSSProperties = {
  background: 'var(--surface-sunk)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--ink)',
  fontSize: 12.5,
  minHeight: 36,
  padding: '8px 10px',
  width: '100%',
};
