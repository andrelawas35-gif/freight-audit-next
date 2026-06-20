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

export const dynamic = 'force-dynamic';

export default async function ExceptionsPage() {
  let rows: Awaited<ReturnType<typeof listExceptions>> = [];
  try {
    rows = await listExceptions('open', 200);
  } catch (err) {
    console.error('Exceptions load failed:', err);
  }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <Link href="/ingestion" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>← Ingestion</Link>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Exceptions queue</h1>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
          Codes the parser didn’t recognize. Map each once — the system remembers and
          applies it automatically on future ingests.
        </p>
      </div>

      <ExceptionsQueue rows={rows} accessorials={STANDARD_ACCESSORIALS} clerkEnabled={clerkEnabled()} />
    </div>
  );
}
