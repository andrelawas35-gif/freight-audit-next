/*
  components/auth/auth-ui.tsx — shared presentational bits for auth forms.
*/

'use client';

import type { CSSProperties } from 'react';

export const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'var(--surface-sunk)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
};

export const labelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--ink-2)',
  marginBottom: 5,
  display: 'block',
};

export function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 13 }}>
      <span style={labelStyle}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        style={fieldStyle}
      />
    </label>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: '100%',
        background: 'var(--blue)',
        color: 'oklch(0.16 0.02 244)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        fontSize: 13,
        fontWeight: 700,
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.6 : 1,
        marginTop: 4,
      }}
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'oklch(0.30 0.08 25)',
        border: '1px solid oklch(0.44 0.12 25)',
        color: 'oklch(0.86 0.10 25)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 11px',
        fontSize: 12,
        marginBottom: 13,
      }}
    >
      {message}
    </div>
  );
}
