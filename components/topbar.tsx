/*
  components/topbar.tsx — slim header bar.

  Uses usePathname() to show the right title for the current page.
*/

'use client';

import { usePathname } from 'next/navigation';

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':          { title: 'Today',            sub: 'Action queue · what needs doing right now' },
  '/queue':     { title: 'Audit Queue',      sub: 'Two-pane review · j/k to navigate' },
  '/disputes':  { title: 'Disputes',         sub: 'Recovery pipeline across carriers' },
  '/carriers':  { title: 'Carrier Scorecards', sub: 'Performance, error rates, response times' },
  '/clients':   { title: 'Clients',          sub: 'Gain-share portfolio' },
};

export function Topbar() {
  const pathname = usePathname();
  const meta = PAGE_META[pathname] || PAGE_META['/'];

  return (
    <header style={{
      height: 'var(--topbar-h)', flexShrink: 0, borderBottom: '1px solid var(--line)',
      background: 'var(--surface-sunk)',
      display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em' }}>
          {meta.title}
        </span>
        <span className="mono" style={{
          fontSize: 11, color: 'var(--ink-faint)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.sub}
        </span>
      </div>
    </header>
  );
}
