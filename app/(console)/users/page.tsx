/*
  app/(console)/users/page.tsx — Users & Access (staff admin).

  Promote/demote staff, link users to client companies, and invite new clients.
  Staff-gated by middleware; the actions re-check staff on the server.
*/

import { auth } from '@/auth';
import { fetchRecords } from '@/lib/airtable';
import { listUsers } from '@/lib/users';
import { InviteClient, UsersTable } from '@/components/console/users-admin';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await auth();

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let clients: { id: string; name: string }[] = [];

  try {
    const [usersRaw, clientsRaw] = await Promise.all([
      listUsers(300),
      fetchRecords('Clients', { maxRecords: 500, fields: ['Company name'] }),
    ]);
    users = usersRaw;
    clients = (clientsRaw as Client[])
      .map((c) => ({ id: c.id, name: c['Company name'] || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('Users page load failed:', err);
  }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>Users &amp; access</h1>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
          Invite clients, link accounts to companies, and manage staff access.
        </p>
      </div>

      <InviteClient clients={clients} />
      <UsersTable users={users} clients={clients} currentUserId={session?.user?.id || ''} />
    </div>
  );
}
