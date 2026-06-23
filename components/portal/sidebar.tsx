'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

const NAV_OVERVIEW = [
  { href: '/portal', label: 'Dashboard', icon: 'grid' },
  { href: '/portal/disputes', label: 'Disputes', icon: 'flag' },
  { href: '/portal/invoices', label: 'Invoices', icon: 'file-text' },
] as const;

const NAV_TOOLS = [
  { href: '/portal/upload', label: 'Upload data', icon: 'upload' },
  { href: '/portal/reports', label: 'Reports', icon: 'bar-chart' },
] as const;

const NAV_BOTTOM = [
  { href: '/portal/settings', label: 'Settings', icon: 'sliders' },
  { href: '/portal/help', label: 'Help', icon: 'help-circle' },
] as const;

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const s = { width: size, height: size, strokeWidth: 1.7, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'grid': return <svg viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
    case 'flag': return <svg viewBox="0 0 24 24" {...s}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
    case 'file-text': return <svg viewBox="0 0 24 24" {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'upload': return <svg viewBox="0 0 24 24" {...s}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
    case 'bar-chart': return <svg viewBox="0 0 24 24" {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'sliders': return <svg viewBox="0 0 24 24" {...s}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>;
    case 'help-circle': return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'log-out': return <svg viewBox="0 0 24 24" {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    default: return null;
  }
}

export function PortalSidebar({ companyName, onSignOut, isOpen, onClose }: {
  companyName: string;
  onSignOut: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/portal') return pathname === '/portal';
    return pathname.startsWith(href);
  };

  const handleNav = () => { onClose(); };

  const navItem = (item: { href: string; label: string; icon: string }) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={handleNav}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 7,
          fontSize: 12.5,
          fontWeight: 500,
          color: active ? '#EDEDEF' : 'rgba(255,255,255,0.4)',
          background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
          textDecoration: 'none',
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? 'rgba(255,255,255,0.08)' : 'transparent'; }}
      >
        <Icon name={item.icon} />
        {item.label}
      </Link>
    );
  };

  const sectionLabel = (text: string) => (
    <div style={{
      fontFamily: 'var(--mono)',
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'rgba(255,255,255,0.2)',
      padding: '16px 12px 6px',
    }}>
      {text}
    </div>
  );

  const initial = (companyName || 'C').charAt(0).toUpperCase();

  return (
    <aside className={`portal-sidebar${isOpen ? ' is-open' : ''}`} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: 220,
      height: '100vh',
      background: 'rgba(8,8,10,0.95)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      overflow: 'hidden',
    }}>
      {/* Logo + mobile close */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '20px 16px 0',
        marginBottom: 28,
      }}>
        <Image src="/logo-mark.svg" alt="" width={20} height={20} />
        <span style={{ fontSize: 14, fontWeight: 800, color: '#EDEDEF', flex: 1 }}>Aurelian</span>
        <button className="portal-sidebar-close" onClick={onClose} aria-label="Close sidebar">&times;</button>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
        {sectionLabel('Overview')}
        {NAV_OVERVIEW.map(navItem)}
        {sectionLabel('Tools')}
        {NAV_TOOLS.map(navItem)}
      </nav>

      {/* Bottom nav */}
      <div style={{ padding: '0 8px 8px' }}>
        {NAV_BOTTOM.map(navItem)}
      </div>

      {/* User footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #5E6AD2, #818cf8)',
          display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 600, color: '#EDEDEF',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {companyName}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Client</div>
        </div>
        <button
          onClick={onSignOut}
          style={{
            background: 'transparent', border: 'none', padding: 4,
            cursor: 'pointer', color: 'rgba(255,255,255,0.3)',
            transition: 'color 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
          title="Sign out"
        >
          <Icon name="log-out" size={16} />
        </button>
      </div>
    </aside>
  );
}
