/*
  app/(portal)/portal/upload/page.tsx — client data upload.

  Clients upload a CSV of their shipments (the warehouse "expected" data:
  actual weight/dimensions, addresses, service level). These get staged and
  matched against carrier invoices by the audit engine.
*/

import { UploadForm } from '@/components/portal/upload-form';

export const metadata = { title: 'Upload data · Aurelian Collective' };

export default function UploadPage() {
  return (
    <div style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>Upload shipment data</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        Upload a CSV export from your WMS or shipping platform. We match it against carrier
        invoices to find overcharges.
      </p>

      <UploadForm />

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: 'var(--ink-2)' }}>
          Accepted columns
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          Headers are matched flexibly (case-insensitive). Include at least a{' '}
          <strong>tracking number</strong> or <strong>PRO number</strong>. Other recognized
          columns: carrier, weight, length, width, height, origin zip, destination zip,
          address type, service level, ship date, reference/order number.
        </p>
      </section>
    </div>
  );
}
