import Link from 'next/link';
import { Card, ConsoleEmptyState, ConsoleErrorState, SectionLabel, TableFooter } from '@/components/ui/primitives';
import { listClientOptions } from '@/lib/intelligence/policy-service';

export const dynamic = 'force-dynamic';

export default async function GatewayReadinessIndexPage() {
  try {
    const clients = await listClientOptions();

    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0 }}>Gateway Readiness</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>Choose a client assessment.</div>
        </div>
        <SectionLabel>Clients</SectionLabel>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Client</th><th>Assessment</th></tr></thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>
                    <Link href={`/gateway-readiness/${client.id}`} style={{ color: 'var(--blue-ink)', fontWeight: 700, textDecoration: 'none' }}>
                      Open readiness report
                    </Link>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={2}><ConsoleEmptyState icon="users" heading="No clients" description="Create a client before generating a readiness assessment." /></td></tr>
              )}
            </tbody>
          </table>
          <TableFooter showing={clients.length} total={clients.length} label="clients" />
        </Card>
      </div>
    );
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Gateway readiness failed to load"
        message={err instanceof Error ? err.message : String(err)}
        hint="Confirm the database is reachable."
      />
    );
  }
}
