'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadDocument, type UploadResult } from '@/app/(portal)/portal/upload/actions';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/portal/upload-router';

const TEMPLATE_HEADERS = ['Tracking Number', 'PRO Number', 'Reference', 'Carrier', 'Weight', 'Length', 'Width', 'Height', 'Origin Zip', 'Destination Zip', 'Address Type', 'Service Level', 'Ship Date'];
const TEMPLATE_SAMPLE = ['1Z999AA10123456784', '', 'PO-1001', 'UPS', '12.5', '14', '10', '8', '07105', '90210', 'Commercial', 'Ground', '2026-06-10'];

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([`${TEMPLATE_HEADERS.join(',')}\n${TEMPLATE_SAMPLE.join(',')}\n`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'aurelian-shipment-template.csv'; anchor.click();
  URL.revokeObjectURL(url);
}

const DOC_TYPE_SUBTITLES: Record<DocumentType, string> = {
  shipment_csv: 'Upload a CSV export from your WMS or shipping platform',
  insurance_policy: 'Upload your policy document (PDF, DOCX, or image)',
  carrier_contract: 'Upload your carrier contract (PDF, DOCX, or image)',
  sop: 'Upload your SOP document (PDF, DOCX, or image)',
  claims_history: 'Upload your claims history (PDF, DOCX, or image)',
};

const DOC_TYPE_ACCEPT: Record<DocumentType, string> = {
  shipment_csv: '.csv,text/csv',
  insurance_policy: '.pdf,.doc,.docx,.txt,.jpg,.png',
  carrier_contract: '.pdf,.doc,.docx,.txt,.jpg,.png',
  sop: '.pdf,.doc,.docx,.txt,.jpg,.png',
  claims_history: '.pdf,.doc,.docx,.txt,.jpg,.png',
};

const CSV_EXTENSIONS = ['.csv'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.png'];

function validForType(name: string, type: DocumentType): boolean {
  const lower = name.toLowerCase();
  if (type === 'shipment_csv') {
    return CSV_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadResult | undefined, FormData>(uploadDocument, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState('');
  const [docType, setDocType] = useState<DocumentType>('shipment_csv');
  const inputRef = useRef<HTMLInputElement>(null);

  return <form action={formAction} onSubmit={(event) => { if (!file) { event.preventDefault(); setClientError('Choose a file before uploading.'); } }}>
    {/* Document type selector */}
    <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
      {DOCUMENT_TYPES.map((dt) => (
        <button
          key={dt}
          type="button"
          onClick={() => { setDocType(dt); setFile(null); setClientError(''); if (inputRef.current) inputRef.current.value = ''; }}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: docType === dt ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: docType === dt ? '#EDEDEF' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.1s',
          }}
        >
          {DOCUMENT_TYPE_LABELS[dt]}
        </button>
      ))}
    </div>

    {/* Hidden input for document_type */}
    <input type="hidden" name="document_type" value={docType} />

    <div
      className="portal-drop-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault(); const next = event.dataTransfer.files[0];
        if (next && validForType(next.name, docType)) { setFile(next); setClientError(''); if (inputRef.current) { const transfer = new DataTransfer(); transfer.items.add(next); inputRef.current.files = transfer.files; } }
        else setClientError(`Only ${docType === 'shipment_csv' ? 'CSV' : 'PDF, DOCX, TXT, JPG, or PNG'} files are accepted.`);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
      <strong>{DOC_TYPE_SUBTITLES[docType]}</strong>
      <button type="button" className="portal-primary-button" onClick={() => inputRef.current?.click()}>Choose file</button>
      <input
        ref={inputRef} id="file" name="file" type="file"
        accept={DOC_TYPE_ACCEPT[docType]} hidden
        onChange={(event) => {
          const next = event.target.files?.[0] || null;
          if (next && validForType(next.name, docType)) { setFile(next); setClientError(''); }
          else { setFile(null); setClientError(`Only ${docType === 'shipment_csv' ? 'CSV' : 'PDF, DOCX, TXT, JPG, or PNG'} files are accepted.`); }
        }}
      />
    </div>

    {file ? <div className="portal-selected-file"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" /></svg><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div><button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label="Remove file">x</button></div> : null}

    <div className="portal-upload-actions">
      <button type="submit" className="portal-primary-button" disabled={pending}>{pending ? 'Uploading...' : 'Upload & stage'}</button>
      {docType === 'shipment_csv' ? <button type="button" className="portal-ghost-button" onClick={downloadTemplate}>Download template</button> : null}
    </div>

    {clientError ? <div className="portal-upload-message error"><strong>Upload unavailable</strong><span>{clientError}</span></div> : null}
    {state ? <UploadMessage state={state} /> : null}
  </form>;
}

function UploadMessage({ state }: { state: UploadResult }) {
  const isDocUpload = state.documentType && state.documentType !== 'shipment_csv';

  if (isDocUpload && state.ok) {
    return (
      <div className="portal-upload-message success">
        <strong>Upload successful</strong>
        <span>{state.message || 'Document uploaded successfully.'}</span>
      </div>
    );
  }

  if (state.ok && typeof state.dataHealth === 'number') {
    return (
      <div className="portal-upload-message success">
        <strong>Upload successful</strong>
        <span>{state.staged} shipment(s) staged from {state.rows} row(s).{state.skipped ? ` ${state.skipped} skipped.` : ''}</span>
        <HealthBar pct={state.dataHealth} />
      </div>
    );
  }

  return (
    <div className="portal-upload-message error">
      <strong>{state.ok ? 'Upload successful' : 'Upload failed'}</strong>
      <span>{state.error}</span>
    </div>
  );
}

function HealthBar({ pct }: { pct: number }) {
  return <div className="portal-health"><div><span>Rows with usable dimensions</span><strong>{pct}%</strong></div><div><span style={{ width: `${pct}%` }} /></div></div>;
}
