/*
  app/(portal)/portal/layout.tsx — client-facing portal shell.

  Simple top nav (Dashboard / Upload) + company name + sign out.
  No staff sidebar. Access is gated by middleware (any signed-in user).
*/

import Link from 'next/link';
import { auth } from '@/auth';
import { logout } from './actions';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const name = session?.user?.name || session?.user?.email || 'Account';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-sunk)' }}>
      <header
        style={{
          height: 52,
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 22,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 15 }}>Aurelian Collective</span>
        <nav style={{ display: 'flex', gap: 16, flex: 1 }}>
          <Link href="/portal" style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>
            Dashboard
          </Link>
          <Link href="/portal/upload" style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>
            Upload data
          </Link>
        </nav>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{name}</span>
        <form action={logout}>
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 11px',
              fontSize: 12,
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </form>
      </header>
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24 }}>{children}</main>
    </div>
  );
}
