/*
  components/topbar.tsx — slim header bar.

  Uses usePathname() to show the right title for the current page.
*/

'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CommandPalette } from './command-palette';

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':          { title: 'Today',            sub: 'Action queue · what needs doing right now' },
  '/queue':     { title: 'Audit Queue',      sub: 'Two-pane review · j/k to navigate' },
  '/disputes':  { title: 'Disputes',         sub: 'Recovery pipeline across carriers' },
  '/carriers':  { title: 'Carrier Scorecards', sub: 'Performance, error rates, response times' },
  '/clients':   { title: 'Clients',          sub: 'Gain-share portfolio' },
};

export function Topbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const meta = PAGE_META[pathname] || PAGE_META['/'];

  // Bind global Cmd+K shortcut sequence
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <div 
      style={{
        height: 48, borderBottom: '1px solid var(--line)', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'var(--surface)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Console</span>
      </div>

      {/* SEARCH ANCHOR INPUT STRIP */}
      <div 
        onClick={() => setSearchOpen(true)}
        style={{
          width: 240, height: 28, borderRadius: 6, background: 'var(--surface-sunk)',
          border: '1px solid var(--line)', display: 'flex', alignItems: 'center',
          padding: '0 8px', gap: 8, cursor: 'pointer', color: 'var(--ink-faint)'
        }}
      >
        <span style={{ fontSize: 12 }}>🔍</span>
        <span style={{ fontSize: 11.5, flex: 1, textAlign: 'left' }}>Search records...</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 3 }}>⌘K</span>
      </div>

      {/* Interactive global overlays */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </header>
  );
}
