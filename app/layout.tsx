/*
  app/layout.tsx — root layout.

  This wraps every page. It loads your CSS, sets the dark theme,
  and renders the sidebar + topbar shell.
  
  In Next.js, this file replaces the outer part of your app.jsx.
  Navigation is handled by file-based routing, not useState.
*/

// @ts-ignore
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import GlobalStatBar from '@/components/global-stat-bar'; // 1. Import the new global component

export const metadata = {
  title: 'Reclaim · Freight Audit Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Sidebar />
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
