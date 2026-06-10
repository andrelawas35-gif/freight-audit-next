/*
  components/sidebar.tsx — main navigation.

  KEY CHANGE from your old code:
  - Old: useState('today') + setRoute('queue') 
  - New: <Link href="/queue"> + usePathname() to know which is active
  
  Next.js handles the routing automatically based on folder structure.
  No more switch/case in app.jsx.
*/

'use client';  // needed because we use usePathname() and onClick

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV = [
  { href: '/',          label: 'Today',    glyph: 'home',  kbd: '1' },
  { href: '/queue',     label: 'Queue',    glyph: 'flag',  kbd: '2' },
  { href: '/disputes',  label: 'Disputes', glyph: 'gavel', kbd: '3' },
  { href: '/carriers',  label: 'Carriers', glyph: 'truck', kbd: '4' },
  { href: '/clients',   label: 'Clients',  glyph: 'users', kbd: '5' },
];

function Glyph({ name, size = 15 }: { name: string; size?: number }) {
  const s = {
    width: size, height: size, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const paths: Record<string, React.ReactNode> = {
    home:   <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z" />,
    flag:   <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    gavel:  <><path d="M14 13l-7 7M11 6l6 6M9 4l6 6-3 3-6-6zM17 14l3 3" /></>,
    truck:  <><path d="M2 17V6h12v11M14 10h4l3 4v3h-3M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></>,
    users:  <><circle cx="8" cy="8" r="3.2" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0M16 6.2a3.2 3.2 0 0 1 0 5.6M18.5 20a5.5 5.5 0 0 0-3-4.9" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-3.5-3.5" /></>,
    moon:   <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />,
    sun:    <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" /></>,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name]}</svg>;
}

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState('dark');

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key.toLowerCase() === 't' && !e.shiftKey) toggleTheme();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside style={{
      width: 'var(--sidebar-w)', flexShrink: 0, height: '100%',
      borderRight: '1px solid var(--line)', background: 'var(--surface-sunk)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'linear-gradient(150deg, var(--amber) 0%, var(--hot) 120%)',
          display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)',
        }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'var(--canvas)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" />
          </svg>
        </div>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em' }}>Reclaim</div>
          <div className="mono" style={{ fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>FREIGHT AUDIT</div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '5px 9px',
              border: 'none', borderRadius: 5, width: '100%', textAlign: 'left',
              textDecoration: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              color: active ? 'var(--ink)' : 'var(--ink-2)',
              fontSize: 12.5, fontWeight: active ? 600 : 500,
              transition: 'background 0.08s',
            }}>
              <span style={{ color: active ? 'var(--amber)' : 'var(--ink-3)', display: 'flex' }}>
                <Glyph name={n.glyph} size={14} />
              </span>
              <span style={{ flex: 1 }}>{n.label}</span>
              <span className="kbd" style={{ opacity: 0.5 }}>{n.kbd}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div style={{ marginTop: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          padding: '8px 10px', borderRadius: 7, background: 'var(--surface)',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Last audit run
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--green)', boxShadow: '0 0 0 2px var(--green-soft)' }} />
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>Today 6:00 AM</span>
          </div>
        </div>
        <button onClick={toggleTheme} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', width: '100%',
          background: 'transparent', border: '1px solid var(--line)', borderRadius: 5,
          color: 'var(--ink-3)', fontSize: 11.5, textAlign: 'left',
          cursor: 'pointer',
        }}>
          <Glyph name={theme === 'dark' ? 'sun' : 'moon'} size={12} />
          <span style={{ flex: 1 }}>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
      </div>
    </aside>
  );
}
