'use client';

import { useActionState } from 'react';
import { triggerAudit, type TriggerResult } from '@/app/(console)/engine/actions';

type ClientOption = { id: string; name: string };

export function RunPanel({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<TriggerResult | undefined, FormData>(
    triggerAudit,
    undefined
  );

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 16,
      }}
    >
      <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>Scope</span>
          <select
            name="clientId"
            defaultValue=""
            style={{
              background: 'var(--surface-sunk)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              fontSize: 13,
              color: 'var(--ink)',
              minWidth: 220,
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', paddingBottom: 9 }}>
          <input type="checkbox" name="dryRun" />
          Dry run (don’t write findings)
        </label>

        <button
          type="submit"
          disabled={pending}
          style={{
            background: 'var(--blue)',
            color: 'oklch(0.16 0.02 244)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? 'Running…' : 'Run audit'}
        </button>
      </form>

      {state && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 'var(--radius-sm)',
            padding: '11px 14px',
            fontSize: 12.5,
            lineHeight: 1.5,
            background: state.ok ? 'var(--green-soft)' : 'oklch(0.30 0.08 25)',
            border: `1px solid ${state.ok ? 'var(--green-line)' : 'oklch(0.44 0.12 25)'}`,
            color: state.ok ? 'var(--green-ink)' : 'oklch(0.86 0.10 25)',
          }}
        >
          {state.ok ? (
            <>
              Checked <strong>{state.invoicesChecked}</strong> invoice(s) ·{' '}
              <strong>{state.findingsCreated}</strong> finding(s) created.
              {state.errors && state.errors.length > 0 && (
                <div style={{ marginTop: 6, color: 'var(--amber-ink)' }}>
                  {state.errors.length} rule error(s) — see run history.
                </div>
              )}
            </>
          ) : (
            state.error
          )}
        </div>
      )}
    </div>
  );
}
