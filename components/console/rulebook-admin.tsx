'use client';

import { useActionState, useState, useTransition } from 'react';
import { addRule, editRule, removeRule, type SaveResult } from '@/app/(console)/rulebook/actions';
import { RULE_KEYS } from '@/lib/audit/rule-keys';

type Opt = { id: string; name: string };
type Row = {
  id: string; scope: string; client_id: string | null; carrier_scac: string | null;
  service_level: string | null; rule_key: string; num_value: number | null;
  bool_value: boolean | null; effective_from: string | null; effective_to: string | null;
};

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 12, color: 'var(--ink)',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' };

// ── Add-rule form ────────────────────────────────────────────
export function AddRule({ clients, carriers }: { clients: Opt[]; carriers: Opt[] }) {
  const [state, formAction, pending] = useActionState<SaveResult, FormData>(addRule, undefined);
  const [scope, setScope] = useState('carrier');
  const [ruleKey, setRuleKey] = useState('dim_divisor');
  const meta = RULE_KEYS[ruleKey];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Add / override a rule</h2>
      <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Col label="Scope">
          <select name="scope" value={scope} onChange={(e) => setScope(e.target.value)} style={inputStyle}>
            <option value="global">Global default</option>
            <option value="carrier">Carrier</option>
            <option value="contract">Client contract</option>
          </select>
        </Col>

        {scope === 'contract' && (
          <Col label="Client">
            <select name="clientId" style={inputStyle} defaultValue="">
              <option value="">— select —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Col>
        )}
        {scope !== 'global' && (
          <Col label="Carrier SCAC">
            <select name="carrierScac" style={inputStyle} defaultValue="">
              <option value="">{scope === 'contract' ? '(any carrier)' : '— select —'}</option>
              {carriers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Col>
        )}

        <Col label="Rule">
          <select name="ruleKey" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} style={inputStyle}>
            {Object.entries(RULE_KEYS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </Col>

        {meta?.serviceScoped && (
          <Col label="Service level">
            <input name="serviceLevel" placeholder="e.g. Ground" style={inputStyle} />
          </Col>
        )}

        <Col label="Value">
          {meta?.type === 'bool' ? (
            <select name="value" style={inputStyle} defaultValue="true">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input name="value" type="number" step="any" placeholder="0" style={{ ...inputStyle, width: 90 }} />
          )}
        </Col>

        <Col label="Effective from"><input name="effectiveFrom" type="date" style={inputStyle} /></Col>
        <Col label="Effective to"><input name="effectiveTo" type="date" style={inputStyle} /></Col>

        <button type="submit" disabled={pending} style={{
          background: 'var(--blue)', color: 'oklch(0.16 0.02 244)', border: 'none',
          borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700,
          cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
        }}>{pending ? 'Saving…' : 'Add rule'}</button>
      </form>
      {state && !state.ok && <div style={{ marginTop: 10, fontSize: 12, color: 'oklch(0.84 0.10 25)' }}>{state.error}</div>}
      {state && state.ok && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green-ink)' }}>Saved.</div>}
    </div>
  );
}

function Col({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={labelStyle}>{label}</span>{children}</label>;
}

// ── Rules table ──────────────────────────────────────────────
const scopeColor = (s: string) =>
  s === 'contract' ? 'var(--green-ink)' : s === 'carrier' ? 'var(--blue-ink)' : 'var(--ink-3)';

export function RulesTable({ rows, clientNames }: { rows: Row[]; clientNames: Record<string, string> }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5, fontWeight: 700 }}>
        Rulebook <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {rows.length} · contract → carrier → global</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Scope</th><th>Rule</th><th>Applies to</th><th>Value</th>
            <th>Effective</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <RuleRow key={r.id} row={r} clientNames={clientNames} />)}
          {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>No rules yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RuleRow({ row, clientNames }: { row: Row; clientNames: Record<string, string> }) {
  const meta = RULE_KEYS[row.rule_key];
  const isBool = meta?.type === 'bool';
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [val, setVal] = useState(isBool ? String(row.bool_value) : (row.num_value ?? '').toString());
  const [from, setFrom] = useState(row.effective_from || '');
  const [to, setTo] = useState(row.effective_to || '');

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 1500); };

  const save = () => start(async () => {
    await editRule(row.id, {
      numValue: isBool ? null : (val === '' ? null : parseFloat(val)),
      boolValue: isBool ? val === 'true' : null,
      effectiveFrom: from || null,
      effectiveTo: to || null,
    });
    flash('Saved');
  });
  const del = () => start(async () => { await removeRule(row.id); });

  const applies = row.scope === 'contract'
    ? `${clientNames[row.client_id || ''] || 'client'}${row.carrier_scac ? ` · ${row.carrier_scac}` : ''}`
    : row.scope === 'carrier' ? row.carrier_scac : '—';

  return (
    <tr style={{ opacity: pending ? 0.6 : 1 }}>
      <td><span style={{ fontSize: 11, fontWeight: 600, color: scopeColor(row.scope) }}>{row.scope}</span></td>
      <td>
        <div style={{ fontSize: 12 }}>{meta?.label || row.rule_key}</div>
        {row.service_level && <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{row.service_level}</div>}
      </td>
      <td className="mono" style={{ fontSize: 11.5 }}>{applies}</td>
      <td>
        {isBool ? (
          <select value={val} onChange={(e) => setVal(e.target.value)} style={inputStyle}>
            <option value="true">true</option><option value="false">false</option>
          </select>
        ) : (
          <input type="number" step="any" value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, width: 80 }} />
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, fontSize: 11 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, fontSize: 11 }} />
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={save} disabled={pending} style={btn('var(--blue-ink)')}>Save</button>
          <button onClick={del} disabled={pending} style={btn('oklch(0.80 0.12 25)')}>Delete</button>
          {note && <span style={{ fontSize: 11, color: 'var(--green-ink)' }}>{note}</span>}
        </div>
      </td>
    </tr>
  );
}

const btn = (color: string): React.CSSProperties => ({
  background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
  padding: '4px 9px', fontSize: 11.5, color, cursor: 'pointer',
});
