'use client';

import { useActionState, useState, useTransition } from 'react';
import { addRule, editRule, removeRule, type SaveResult } from '@/app/(console)/rulebook/actions';
import { RULE_KEYS } from '@/lib/audit/rule-keys';

type Opt = { id: string; name: string };
type Row = {
  id: string; scope: string; client_id: string | null; carrier_scac: string | null;
  service_level: string | null; rule_key: string; num_value: number | null;
  bool_value: boolean | null; text_value: string | null;
  effective_from: string | null; effective_to: string | null; clause_ref: string | null;
};

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 12, color: 'var(--ink)',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' };

const CARRIER_KEYS = Object.entries(RULE_KEYS).filter(([, m]) => m.group === 'carrier');
const TPL_KEYS = Object.entries(RULE_KEYS).filter(([, m]) => m.group === '3pl');

// ── Add-rule form ────────────────────────────────────────────
export function AddRule({ clients, carriers }: { clients: Opt[]; carriers: Opt[] }) {
  const [state, formAction, pending] = useActionState<SaveResult, FormData>(addRule, undefined);
  const [scope, setScope] = useState('carrier');
  const [ruleKey, setRuleKey] = useState('dim_divisor');
  const meta = RULE_KEYS[ruleKey];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16 }}>
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
          <Col label="Carrier / 3PL SCAC">
            <select name="carrierScac" style={inputStyle} defaultValue="">
              <option value="">{scope === 'contract' ? '(any carrier)' : '— select —'}</option>
              {carriers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Col>
        )}

        <Col label="Rule">
          <select name="ruleKey" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} style={inputStyle}>
            <optgroup label="Parcel / LTL carrier">
              {CARRIER_KEYS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </optgroup>
            <optgroup label="3PL fulfillment">
              {TPL_KEYS.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </optgroup>
          </select>
        </Col>

        {meta?.serviceScoped && (
          <Col label={meta.serviceLabel || 'Service level'}>
            <input name="serviceLevel" placeholder="e.g. Ground / Pallet" style={inputStyle} />
          </Col>
        )}

        <Col label="Value">
          {meta?.type === 'bool' ? (
            <select name="value" style={inputStyle} defaultValue="true">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : meta?.type === 'text' && meta.options ? (
            <select name="value" style={inputStyle} defaultValue={meta.options[0]}>
              {meta.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : meta?.type === 'text' ? (
            <input name="value" placeholder="value" style={inputStyle} />
          ) : (
            <input name="value" type="number" step="any" placeholder="0" style={{ ...inputStyle, width: 90 }} />
          )}
        </Col>

        <Col label="Clause ref (MSA)">
          <input name="clauseRef" placeholder="e.g. Exhibit A §2.1" style={{ ...inputStyle, width: 150 }} />
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
      <table className="tbl">
        <thead>
          <tr>
            <th>Scope</th><th>Rule</th><th>Applies to</th><th>Value</th>
            <th>Clause ref</th><th>Effective</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <RuleRow key={r.id} row={r} clientNames={clientNames} />)}
          {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>No rules yet.</td></tr>}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--line)' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.03em' }}>
            {rows.length} rule{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function RuleRow({ row, clientNames }: { row: Row; clientNames: Record<string, string> }) {
  const meta = RULE_KEYS[row.rule_key];
  const isBool = meta?.type === 'bool';
  const isText = meta?.type === 'text';
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [val, setVal] = useState(
    isBool ? String(row.bool_value) : isText ? (row.text_value ?? '') : (row.num_value ?? '').toString()
  );
  const [clause, setClause] = useState(row.clause_ref || '');
  const [from, setFrom] = useState(row.effective_from || '');
  const [to, setTo] = useState(row.effective_to || '');

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 1500); };

  const save = () => start(async () => {
    await editRule(row.id, {
      numValue: isBool || isText ? null : (val === '' ? null : parseFloat(val)),
      boolValue: isBool ? val === 'true' : null,
      textValue: isText ? val : null,
      effectiveFrom: from || null,
      effectiveTo: to || null,
      clauseRef: clause || null,
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
        ) : isText && meta?.options ? (
          <select value={val} onChange={(e) => setVal(e.target.value)} style={inputStyle}>
            {meta.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : isText ? (
          <input value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        ) : (
          <input type="number" step="any" value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, width: 80 }} />
        )}
      </td>
      <td>
        <input value={clause} onChange={(e) => setClause(e.target.value)} placeholder="—" style={{ ...inputStyle, width: 130, fontSize: 11 }} />
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
