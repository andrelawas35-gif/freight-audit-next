/*
  app/(console)/ingestion/exceptions/page.tsx — Analyst exceptions queue.

  Unmapped carrier codes the parser couldn't resolve. Mapping one here writes a
  learned_mapping so the pipeline handles that code automatically next time.
*/

import Link from 'next/link';
import { listExceptions } from '@/lib/ingestion/mappings';
import { clerkEnabled } from '@/lib/ingestion/data-clerk';
import { STANDARD_ACCESSORIALS } from '@/lib/ingestion/accessorial-map';
import { ExceptionsQueue } from '@/components/console/exceptions-queue';
import { KPI, SectionLabel } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export default async function ExceptionsPage() {
  let rows: Awaited<ReturnType<typeof listExceptions>> = [];
  try {
    rows = await listExceptions('open', 200);
  } catch (err) {
    console.error('Exceptions load failed:', err);
  }

  const accessorialCount = rows.filter((r) => r.mapping_type === 'accessorial').length;
  const serviceLevelCount = rows.filter((r) => r.mapping_type === 'service_level').length;
  const totalOccurrences = rows.reduce((s, r) => s + r.occurrences, 0);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div>
        <Link href="/console/ingestion" style={{ fontSize: 11.5, color: 'var(--ink-3)', textDecoration: 'none' }}>
          ← Ingestion
        </Link>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPI
          label="Open exceptions"
          tone={rows.length > 0 ? 'amber' : 'ink'}
          accentBar={rows.length > 0 ? 'var(--amber)' : 'var(--line-strong)'}
          value={String(rows.length)}
          sub="codes to map"
        />
        <KPI
          label="Accessorial"
          value={String(accessorialCount)}
          sub="unknown charge codes"
        />
        <KPI
          label="Service level"
          value={String(serviceLevelCount)}
          sub="unknown service codes"
        />
        <KPI
          label="Total occurrences"
          value={String(totalOccurrences)}
          sub="invoices affected"
        />
      </div>

      {/* Queue */}
      <div>
        <SectionLabel right={
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            map once — learned forever
            {!clerkEnabled() && ' · AI suggestions off'}
          </span>
        }>Exceptions queue</SectionLabel>
        <ExceptionsQueue rows={rows} accessorials={STANDARD_ACCESSORIALS} clerkEnabled={clerkEnabled()} />
      </div>
    </div>
  );
}
