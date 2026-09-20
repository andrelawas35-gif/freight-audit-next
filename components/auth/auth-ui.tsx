'use client';

import type { CSSProperties } from 'react';

export const fieldStyle: CSSProperties = {
  width: '100%',
  background: '#0F0F12',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: '#EDEDEF',
  outline: 'none',
};

export const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: 6,
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
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        style={fieldStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#5E6AD2';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(94,106,210,0.25)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
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
        background: '#5E6AD2',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '11px 16px',
        fontSize: 13,
        fontWeight: 700,
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.6 : 1,
        marginTop: 4,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = '#6872D9'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#5E6AD2'; }}
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
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.15)',
        color: '#f87171',
        borderRadius: 8,
        padding: '9px 12px',
        fontSize: 12,
        marginBottom: 14,
      }}
    >
      {message}
    </div>
  );
}
