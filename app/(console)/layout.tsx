/*
  app/(console)/layout.tsx — internal staff console shell.

  Holds the sidebar + topbar + global stat bar that used to live in the root
  layout. Only staff reach these routes (enforced by middleware/authConfig).
*/

import type { ComponentType } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import GlobalStatBar from '@/components/global-stat-bar';
import { fetchRecords } from '@/lib/airtable';

type SidebarProps = {
  searchAudits: any[];
  searchDisputes: any[];
};
const SidebarWithProps = Sidebar as ComponentType<SidebarProps>;

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let searchAudits: any[] = [];
  let searchDisputes: any[] = [];

  try {
    const [aData, dData] = await Promise.all([
      fetchRecords('Audit Results', { maxRecords: 500, fields: ['Invoice number', 'Carrier SCAC', 'Variance'] }),
      fetchRecords('Disputes', { maxRecords: 500, fields: ['Invoice', 'Status', 'Disputed amount'] }),
    ]);
    searchAudits = aData;
    searchDisputes = dData;
  } catch (err) {
    console.error('Failed to fetch search index:', err);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarWithProps searchAudits={searchAudits} searchDisputes={searchDisputes} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        <GlobalStatBar />
        <Topbar />
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
