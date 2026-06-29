import { getSql } from '@/lib/db';
import { fmtUSD, fmtDate } from '@/lib/format';
import { Card, ConsoleErrorState, ConsoleEmptyState, SectionLabel, TableFooter } from '@/components/ui/primitives';
import { GatewayTagEditor } from './tag-editor';

export const dynamic = 'force-dynamic';

interface GatewayTagRow {
  id: string;
  client: string;
  carrier: string;
  rule: string;
  variance: number;
  preventability: string;
  category: string | null;
  ruleSuggestion: string | null;
  invoiceNumber: string | null;
  trackingNumber: string | null;
  auditedAt: string | null;
}

export default async function GatewayTagsPage() {
  let rows: GatewayTagRow[] = [];
  let loadError: string | null = null;
  let counts = { preventable: 0, nonPreventable: 0, unknown: 0 };

  try {
    const sql = await getSql();
    const result = await sql`
      SELECT
        id,
        "Client"[1] AS client,
        COALESCE("Carrier (display)", "Carrier SCAC") AS carrier,
        "Rule name" AS rule,
        "Variance"::numeric AS variance,
        "Gateway preventability" AS preventability,
        "Gateway category" AS category,
        "Gateway rule suggestion" AS rule_suggestion,
        "Invoice number" AS invoice_number,
        "Tracking number" AS tracking_number,
        "Audited at" AS audited_at
      FROM "Audit Results"
      WHERE "Variance" IS NOT NULL
      ORDER BY "Audited at" DESC NULLS LAST, variance DESC
      LIMIT 500
    `;

    rows = (result as any[]).map((r: any) => ({
      id: r.id,
      client: r.client ?? '—',
      carrier: r.carrier ?? '—',
      rule: r.rule ?? '—',
      variance: Number(r.variance) || 0,
      preventability: r.preventability ?? 'UNKNOWN',
      category: r.category ?? null,
      ruleSuggestion: r.rule_suggestion ?? null,
      invoiceNumber: r.invoice_number ?? null,
      trackingNumber: r.tracking_number ?? null,
      auditedAt: r.audited_at ?? null,
    }));

    counts.preventable = rows.filter(r => r.preventability === 'PREVENTABLE_BY_GATEWAY').length;
    counts.nonPreventable = rows.filter(r => r.preventability === 'NON_PREVENTABLE_BY_GATEWAY').length;
    counts.unknown = rows.filter(r => r.preventability === 'UNKNOWN').length;
  } catch (err: any) {
    loadError = err.message ?? 'Failed to load gateway tag data.';
  }

  const totalLoss = rows
    .filter(r => r.preventability === 'PREVENTABLE_BY_GATEWAY')
    .reduce((sum, r) => sum + Math.abs(r.variance), 0);

  return (
    <div style={{ padding: 14, maxWidth: 1340, margin: '0 auto', width: '100%' }}>
      {loadError ? (
        <ConsoleErrorState
          heading="Couldn't load gateway tag data"
          message={loadError}
          hint="Check database connectivity and try again."
        />
      ) : rows.length === 0 ? (
        <ConsoleEmptyState
          icon="eye"
          heading="No audit results yet"
          description="Run an audit to generate findings, then gateway taxonomy tags will appear here for review."
        />
      ) : (
        <>
          <SectionLabel>Gateway Taxonomy Review</SectionLabel>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 0, marginBottom: 14 }}>
            Confirm, edit, or dismiss rule-generated gateway preventability tags before they flow into readiness reports and backtests.
          </p>

          {/* ── KPI Row ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Preventable</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--amber-ink)' }}>{counts.preventable}</div>
            </Card>
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Non-Preventable</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green-ink)' }}>{counts.nonPreventable}</div>
            </Card>
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Unreviewed</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-2)' }}>{counts.unknown}</div>
            </Card>
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Preventable Loss</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red-ink)' }}>{fmtUSD(totalLoss, true)}</div>
            </Card>
          </div>

          {/* ── Gateway Tag Table ───────────────────── */}
          <GatewayTagEditor rows={rows} />

          <TableFooter showing={rows.length} total={rows.length} label="audit results" />
        </>
      )}
    </div>
  );
}
