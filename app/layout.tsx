/*
  app/layout.tsx — root layout.

  This wraps every page. It loads your CSS, sets the dark theme,
  and renders the sidebar + topbar shell.
  
  In Next.js, this file replaces the outer part of your app.jsx.
  Navigation is handled by file-based routing, not useState.
*/

// @ts-ignore
import './globals.css';
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

export const metadata = {
  title: 'Reclaim · Freight Audit Console',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let searchAudits: any[] = [];
  let searchDisputes: any[] = [];

  try {
    const [aData, dData] = await Promise.all([
      fetchRecords('Audit Results', { maxRecords: 500, fields: ['Invoice number', 'Carrier SCAC', 'Variance'] }),
      fetchRecords('Disputes', { maxRecords: 500, fields: ['Invoice', 'Status', 'Disputed amount'] })
    ]);
    searchAudits = aData;
    searchDisputes = dData;
  } catch (err) {
    console.error('Failed to fetch search index:', err);
  }
 
  return (
    <html lang="en" data-theme="dark">
      <body>
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
      </body>
    </html>
  );
}
