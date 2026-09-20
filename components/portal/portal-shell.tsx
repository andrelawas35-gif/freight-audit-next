'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { logout } from '@/app/(portal)/portal/actions';
import { PortalSidebar } from './sidebar';

export function PortalShell({ companyName, children }: {
  companyName: string;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = () => {
    startTransition(() => { logout(); });
  };

  return (
    <div data-portal className="portal-shell">
      {/* Mobile header */}
      <div className="portal-mobile-header">
        <div>
          <Image src="/logo-mark.svg" alt="" width={18} height={18} />
          <span style={{ fontWeight: 800 }}>Aurelian</span>
        </div>
        <button onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
      </div>

      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <button
          className="portal-nav-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      <PortalSidebar
        companyName={companyName}
        onSignOut={handleSignOut}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="portal-main">
        <div className="portal-content">
          {children}
        </div>
      </main>
    </div>
  );
}
