'use client';

import { useActionState, useEffect, useRef, useState, useCallback } from 'react';
import { triggerAudit, type EnqueueResult } from '@/app/(console)/console/engine/actions';
import { fmtUSD } from '@/lib/format';

type ClientOption = { id: string; name: string };

type JobStatus = {
  ok: boolean;
  job: {
    id: string;
    status: string;
    result: unknown;
    error: string | null;
  };
};

type AuditSummary = {
  invoicesChecked?: number;
  findingsCreated?: number;
  totalVariance?: number;
  linesChecked?: number;
  annotated?: number;
  carriersPolled?: number;
  filesDownloaded?: number;
  invoicesStaged?: number;
  errors?: string[];
};

export function RunPanel({ clients }: { clients: ClientOption[] }) {
  const [enqueueState, formAction, submitting] = useActionState<EnqueueResult | undefined, FormData>(
    triggerAudit,
    undefined
  );

  const [jobStatus, setJobStatus] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed'>('idle');
  const [jobResult, setJobResult] = useState<AuditSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enqueueState?.ok || !enqueueState.jobId) return;

    setJobStatus('queued');
    setJobResult(null);
    setJobError(null);

    const jobId = enqueueState.jobId;

    const poll = async () => {
      try {
        const res = await fetch(`/api/run-audit/status?jobId=${jobId}`);
        if (!res.ok) return;
        const data = (await res.json()) as JobStatus;
        const status = data.job.status;

        if (status === 'running') {
          setJobStatus('running');
        } else if (status === 'completed') {
          setJobStatus('completed');
          setJobResult((data.job.result as AuditSummary) ?? null);
          stopPolling();
        } else if (status === 'failed') {
          setJobStatus('failed');
          setJobError(data.job.error ?? 'Unknown error');
          stopPolling();
        }
      } catch {
        // network blip — keep polling
      }
    };

    stopPolling();
    pollRef.current = setInterval(poll, 2000);
    poll();

    return stopPolling;
  }, [enqueueState, stopPolling]);

  const isActive = submitting || jobStatus === 'queued' || jobStatus === 'running';

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
            disabled={isActive}
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

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>Job type</span>
          <select
            name="jobType"
            defaultValue="parcel"
            disabled={isActive}
            style={{
              background: 'var(--surface-sunk)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              fontSize: 13,
              color: 'var(--ink)',
              minWidth: 140,
            }}
          >
            <option value="parcel">Parcel / LTL</option>
            <option value="3pl">3PL</option>
            <option value="sftp_fetch">SFTP fetch</option>
            <option value="data_clerk">Data clerk</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)', paddingBottom: 9 }}>
          <input type="checkbox" name="dryRun" disabled={isActive} />
          Dry run
        </label>

        <button
          type="submit"
          disabled={isActive}
          style={{
            background: 'var(--blue)',
            color: 'oklch(0.16 0.02 244)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: isActive ? 'default' : 'pointer',
            opacity: isActive ? 0.6 : 1,
          }}
        >
          {submitting ? 'Queuing…' : isActive ? statusLabel(jobStatus) : 'Run audit'}
        </button>
      </form>

      {/* Enqueue error (e.g. 409 conflict) */}
      {enqueueState && !enqueueState.ok && (
        <StatusBanner ok={false}>{enqueueState.error}</StatusBanner>
      )}

      {/* Job running indicator */}
      {(jobStatus === 'queued' || jobStatus === 'running') && (
        <StatusBanner ok={true} muted>
          Job {jobStatus === 'queued' ? 'queued — waiting for worker…' : 'running…'}
        </StatusBanner>
      )}

      {/* Job completed */}
      {jobStatus === 'completed' && jobResult && (
        <StatusBanner ok={true}>
          <CompletedSummary result={jobResult} />
        </StatusBanner>
      )}

      {/* Job failed */}
      {jobStatus === 'failed' && (
        <StatusBanner ok={false}>{jobError ?? 'Job failed'}</StatusBanner>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  if (s === 'queued') return 'Queued…';
  if (s === 'running') return 'Running…';
  return 'Run audit';
}

function StatusBanner({ ok, muted, children }: { ok: boolean; muted?: boolean; children: React.ReactNode }) {
  const bg = muted ? 'var(--surface-sunk)' : ok ? 'var(--green-soft)' : 'oklch(0.30 0.08 25)';
  const border = muted ? 'var(--line)' : ok ? 'var(--green-line)' : 'oklch(0.44 0.12 25)';
  const color = muted ? 'var(--ink-2)' : ok ? 'var(--green-ink)' : 'oklch(0.86 0.10 25)';

  return (
    <div style={{
      marginTop: 14,
      borderRadius: 'var(--radius-sm)',
      padding: '11px 14px',
      fontSize: 12.5,
      lineHeight: 1.5,
      background: bg,
      border: `1px solid ${border}`,
      color,
    }}>
      {children}
    </div>
  );
}

function CompletedSummary({ result }: { result: AuditSummary }) {
  if (result.annotated != null) {
    return <>Data clerk annotated <strong>{result.annotated}</strong> exception(s).</>;
  }

  if (result.carriersPolled != null) {
    return (
      <>
        Polled <strong>{result.carriersPolled}</strong> carrier(s) ·{' '}
        <strong>{result.filesDownloaded ?? 0}</strong> file(s) downloaded ·{' '}
        <strong>{result.invoicesStaged ?? 0}</strong> invoice(s) staged
        {result.errors && result.errors.length > 0 && (
          <div style={{ marginTop: 6, color: 'var(--amber-ink)' }}>
            {result.errors.length} error(s) — see run history.
          </div>
        )}
      </>
    );
  }

  const checked = result.invoicesChecked ?? result.linesChecked ?? 0;
  const label = result.linesChecked != null ? 'line' : 'invoice';
  return (
    <>
      Checked <strong>{checked}</strong> {label}(s) ·{' '}
      <strong>{result.findingsCreated ?? 0}</strong> finding(s)
      {(result.totalVariance ?? 0) > 0 && (
        <> · {fmtUSD(result.totalVariance!)}</>
      )}
      {result.errors && result.errors.length > 0 && (
        <div style={{ marginTop: 6, color: 'var(--amber-ink)' }}>
          {result.errors.length} rule error(s) — see run history.
        </div>
      )}
    </>
  );
}
