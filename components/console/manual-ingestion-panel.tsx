'use client';

import { useMemo, useState, useActionState } from 'react';
import type { CSSProperties } from 'react';
import { runManualIngestion, type ManualIngestResult } from '@/app/(console)/console/ingestion/actions';

type ClientOption = { id: string; name: string };

type Mode = 'sftp_fetch' | 'carrier_api' | 'wms_webhook' | 'edi_raw' | 'ltl_csv';

const EXAMPLES: Record<Mode, string> = {
  sftp_fetch: '',
  carrier_api: '{\n  "invoiceNumber": "INV-1001",\n  "invoiceDate": "2026-06-23",\n  "totalNetCharge": 128.45,\n  "trackingNumber": "1Z999AA10123456784"\n}',
  wms_webhook: '{\n  "tracking_number": "1Z999AA10123456784",\n  "weight": 12,\n  "length": 10,\n  "width": 8,\n  "height": 6,\n  "destination_zip": "94107"\n}',
  edi_raw: 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260623*1200*U*00401*000000001*0*T*:~\nGS*IM*SENDER*RECEIVER*20260623*1200*1*X*004010~\nST*210*0001~\n...',
  ltl_csv: 'Invoice Number,Invoice Date,PRO Number,Total Billed,Weight,Origin Zip,Destination Zip,Service\nINV-1001,2026-06-23,PRO123,128.45,450,90001,94107,LTL',
};

export function ManualIngestionPanel({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<ManualIngestResult | undefined, FormData>(
    runManualIngestion,
    undefined
  );
  const [mode, setMode] = useState<Mode>('sftp_fetch');

  const placeholder = useMemo(() => EXAMPLES[mode], [mode]);
  const needsBody = mode !== 'sftp_fetch';
  const showClient = mode === 'wms_webhook';
  const showCarrier = mode === 'carrier_api';
  const showSource = mode === 'wms_webhook';
  const showScac = mode === 'ltl_csv';

  return (
    <div style={panelStyle}>
      <form action={formAction} style={{ display: 'grid', gap: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Field label="Mode">
            <select name="mode" value={mode} onChange={(event) => setMode(event.target.value as Mode)} disabled={pending} style={inputStyle}>
              <option value="sftp_fetch">Connect SFTP</option>
              <option value="carrier_api">Carrier API JSON</option>
              <option value="wms_webhook">WMS webhook JSON</option>
              <option value="edi_raw">Raw EDI 210</option>
              <option value="ltl_csv">LTL CSV text</option>
            </select>
          </Field>

          {showClient ? (
            <Field label="Client">
              <select name="clientId" defaultValue="" disabled={pending} style={inputStyle}>
                <option value="">Choose client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </Field>
          ) : null}

          {showCarrier ? (
            <Field label="Carrier">
              <select name="carrier" defaultValue="fedex" disabled={pending} style={inputStyle}>
                <option value="fedex">FedEx</option>
                <option value="ups">UPS</option>
              </select>
            </Field>
          ) : null}

          {showSource ? (
            <Field label="Webhook source">
              <select name="source" defaultValue="shipstation" disabled={pending} style={inputStyle}>
                <option value="shipstation">ShipStation</option>
                <option value="shopify">Shopify</option>
              </select>
            </Field>
          ) : null}

          {showScac ? (
            <Field label="SCAC">
              <input name="scac" placeholder="ODFL" disabled={pending} style={inputStyle} />
            </Field>
          ) : null}
        </div>

        {needsBody ? (
          <textarea
            name="body"
            placeholder={placeholder}
            disabled={pending}
            spellCheck={false}
            style={{
              ...inputStyle,
              minHeight: 142,
              resize: 'vertical',
              fontFamily: 'var(--mono)',
              fontSize: 11.5,
              lineHeight: 1.45,
            }}
          />
        ) : (
          <input type="hidden" name="body" value="" />
        )}

        <button type="submit" disabled={pending} style={buttonStyle}>
          {pending ? 'Running...' : mode === 'sftp_fetch' ? 'Queue SFTP fetch' : 'Run manual ingestion'}
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
          {state.ok ? (
            <>
              <strong>{state.message}</strong>
              {state.details ? <pre style={detailsStyle}>{JSON.stringify(state.details, null, 2)}</pre> : null}
            </>
          ) : state.error}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 650 }}>{label}</span>
      {children}
    </label>
  );
}

const panelStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 16,
};

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

const buttonStyle: CSSProperties = {
  justifySelf: 'start',
  background: 'var(--blue)',
  color: 'oklch(0.16 0.02 244)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 750,
  cursor: 'pointer',
};

const detailsStyle: CSSProperties = {
  margin: '8px 0 0',
  whiteSpace: 'pre-wrap',
  color: 'inherit',
  fontSize: 11,
};
