'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadShipments, type UploadResult } from '@/app/(portal)/portal/upload/actions';

const TEMPLATE_HEADERS = ['Tracking Number', 'PRO Number', 'Reference', 'Carrier', 'Weight', 'Length', 'Width', 'Height', 'Origin Zip', 'Destination Zip', 'Address Type', 'Service Level', 'Ship Date'];
const TEMPLATE_SAMPLE = ['1Z999AA10123456784', '', 'PO-1001', 'UPS', '12.5', '14', '10', '8', '07105', '90210', 'Commercial', 'Ground', '2026-06-10'];

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([`${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_SAMPLE.join(',')}\n`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'aurelian-shipment-template.csv'; anchor.click();
  URL.revokeObjectURL(url);
}

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadResult | undefined, FormData>(uploadShipments, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  return <form action={formAction} onSubmit={(event) => { if (!file) { event.preventDefault(); setClientError('Choose a CSV file before uploading.'); } }}>
    <div className="portal-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); const next = event.dataTransfer.files[0];
      if (next?.name.toLowerCase().endsWith('.csv')) { setFile(next); setClientError(''); if (inputRef.current) { const transfer = new DataTransfer(); transfer.items.add(next); inputRef.current.files = transfer.files; } }
      else setClientError('Only CSV files are accepted.');
    }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
      <strong>Drag and drop your CSV here, or</strong>
      <button type="button" className="portal-primary-button" onClick={() => inputRef.current?.click()}>Choose file</button>
      <input ref={inputRef} id="file" name="file" type="file" accept=".csv,text/csv" hidden onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); setClientError(''); }} />
    </div>

    {file ? <div className="portal-selected-file"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" /></svg><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div><button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label="Remove file">x</button></div> : null}

    <div className="portal-upload-actions"><button type="submit" className="portal-primary-button" disabled={pending}>{pending ? 'Uploading...' : 'Upload & stage'}</button><button type="button" className="portal-ghost-button" onClick={downloadTemplate}>Download template</button></div>

    {clientError ? <div className="portal-upload-message error"><strong>Upload unavailable</strong><span>{clientError}</span></div> : null}
    {state ? <div className={`portal-upload-message ${state.ok ? 'success' : 'error'}`}><strong>{state.ok ? 'Upload successful' : 'Upload failed'}</strong><span>{state.ok ? `${state.staged} shipment(s) staged from ${state.rows} row(s).${state.skipped ? ` ${state.skipped} skipped.` : ''}` : state.error}</span>{state.ok && typeof state.dataHealth === 'number' ? <HealthBar pct={state.dataHealth} /> : null}</div> : null}
  </form>;
}

function HealthBar({ pct }: { pct: number }) {
  return <div className="portal-health"><div><span>Rows with usable dimensions</span><strong>{pct}%</strong></div><div><span style={{ width: `${pct}%` }} /></div></div>;
}
