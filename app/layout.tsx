/*
  app/layout.tsx — root layout.

  Now intentionally minimal: it only sets up <html>/<body>, the dark theme,
  and global CSS. The staff console chrome (sidebar/topbar/stat bar) lives in
  app/(console)/layout.tsx, and the client portal has its own layout in
  app/(portal)/portal/layout.tsx. This keeps the login and portal pages free
  of the internal staff navigation.
*/

// @ts-ignore
import './globals.css';

export const metadata = {
  title: 'Aurelian Collective · Freight Audit Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
