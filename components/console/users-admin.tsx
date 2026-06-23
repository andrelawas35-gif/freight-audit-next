'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  changeRole, changeClient, inviteClient, type InviteResult,
} from '@/app/(console)/users/actions';

type ClientOption = { id: string; name: string };
type AdminUser = {
  id: string; email: string; name: string | null; role: string;
  client_id: string | null; client_name: string | null; created_at: string;
};

const selectStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 12, color: 'var(--ink)',
};

// ── Invite a client ──────────────────────────────────────────
export function InviteClient({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<InviteResult, FormData>(inviteClient, undefined);
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Invite a client</h2>
      <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Field label="Name" name="name" placeholder="Jane Doe" />
        <Field label="Email" name="email" type="email" placeholder="jane@company.com" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={labelStyle}>Existing company</span>
          <select name="clientId" defaultValue="" style={{ ...selectStyle, minWidth: 170 }}>
            <option value="">— select —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', paddingBottom: 8 }}>or</span>
        <Field label="New company" name="company" placeholder="Acme Logistics" required={false} />
        <button type="submit" disabled={pending} style={{
          background: 'var(--blue)', color: 'oklch(0.16 0.02 244)', border: 'none',
          borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700,
          cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
        }}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {state && !state.ok && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'oklch(0.84 0.10 25)' }}>{state.error}</div>
      )}
      {state && state.ok && (
        <div style={{
          marginTop: 12, padding: '11px 13px', borderRadius: 'var(--radius-sm)',
          background: 'var(--green-soft)', border: '1px solid var(--green-line)', fontSize: 12.5, color: 'var(--green-ink)',
        }}>
          Account created for <strong>{state.email}</strong>. Share this one-time password — they should change it after signing in:
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <code style={{
              background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 4,
              padding: '5px 9px', fontSize: 13, color: 'var(--ink)', letterSpacing: '0.04em',
            }}>{state.tempPassword}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(state.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 4, padding: '5px 9px', fontSize: 11.5, color: 'var(--ink-2)', cursor: 'pointer' }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users table ──────────────────────────────────────────────
export function UsersTable({ users, clients, currentUserId }: {
  users: AdminUser[]; clients: ClientOption[]; currentUserId: string;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5, fontWeight: 700 }}>
        All users <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {users.length}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Linked client</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} clients={clients} isSelf={u.id === currentUserId} />
          ))}
          {users.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>No users yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user, clients, isSelf }: { user: AdminUser; clients: ClientOption[]; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(null), 1600); };

  const onRole = (role: string) => start(async () => {
    const r = await changeRole(user.id, role as 'staff' | 'client');
    flash(r.ok ? 'Saved' : (r.error || 'Error'));
  });
  const onClient = (clientId: string) => start(async () => {
    const r = await changeClient(user.id, clientId || null);
    flash(r.ok ? 'Saved' : 'Error');
  });

  return (
    <tr style={{ opacity: pending ? 0.6 : 1 }}>
      <td>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user.name || '—'}{isSelf && <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> · you</span>}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{user.email}</div>
      </td>
      <td>
        <select defaultValue={user.role} onChange={(e) => onRole(e.target.value)} disabled={pending || isSelf} style={selectStyle}>
          <option value="client">Client</option>
          <option value="staff">Staff</option>
        </select>
      </td>
      <td>
        <select defaultValue={user.client_id || ''} onChange={(e) => onClient(e.target.value)} disabled={pending} style={{ ...selectStyle, minWidth: 160 }}>
          <option value="">— None —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td style={{ fontSize: 11, color: 'var(--green-ink)', minWidth: 50 }}>{note}</td>
    </tr>
  );
}

// ── small helpers ────────────────────────────────────────────
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' };

function Field({ label, name, type = 'text', placeholder, required = true }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      <input name={name} type={type} placeholder={placeholder} required={required} style={{
        background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
        padding: '7px 9px', fontSize: 12.5, color: 'var(--ink)', minWidth: 150,
      }} />
    </label>
  );
}
