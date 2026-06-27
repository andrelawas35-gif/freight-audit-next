/*
  app/(console)/users/page.tsx — Users & Access (staff admin).

  Promote/demote staff, link users to client companies, and invite new clients.
  Staff-gated by middleware; the actions re-check staff on the server.
*/

import { auth } from '@/auth';
import { fetchRecords } from '@/lib/db/records';
import { listUsers } from '@/lib/users';
import { InviteClient, UsersTable } from '@/components/console/users-admin';
import { ConsoleErrorState } from '@/components/ui/primitives';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';
const USER_DISPLAY_LIMIT = 300;

export default async function UsersPage() {
  const session = await auth();

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let clients: { id: string; name: string }[] = [];
  let hasMoreUsers = false;
  let loadError: string | null = null;

  try {
    const [usersRaw, clientsRaw] = await Promise.all([
      listUsers(USER_DISPLAY_LIMIT + 1),
      fetchRecords('Clients', { maxRecords: 500, fields: ['Company name'] }),
    ]);
    hasMoreUsers = usersRaw.length > USER_DISPLAY_LIMIT;
    users = usersRaw.slice(0, USER_DISPLAY_LIMIT);
    clients = (clientsRaw as Client[])
      .map((c) => ({ id: c.id, name: c['Company name'] || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error('Users page load failed:', err);
  }

  if (loadError) {
    return (
      <div style={{ padding: 14, maxWidth: 1100, margin: '0 auto' }}>
        <ConsoleErrorState
          heading="Couldn't load users"
          message={loadError}
          hint="Check DATABASE_URL and database connectivity, then reload the page."
        />
      </div>
    );
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
      <UsersTable users={users} clients={clients} currentUserId={session?.user?.id || ''} hasMoreUsers={hasMoreUsers} />
    </div>
  );
}
