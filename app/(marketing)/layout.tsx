/*
  app/(marketing)/layout.tsx — public marketing site shell.
  
  No auth. Clean nav + footer. Shares the design token variables
  (--amber, --canvas, --ink, etc.) from the global stylesheet.
*/

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: {
    default: 'Aurelian Collective — Freight Audit & Compliance',
    template: '%s — Aurelian Collective',
  },
  description:
    'Post-shipment freight audit, carrier dispute recovery, and pre-shipment compliance intelligence for high-value goods shippers.',
};

const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* ── Nav ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--canvas)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              flexShrink: 0,
              background: 'linear-gradient(150deg, var(--amber) 0%, var(--hot) 120%)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: 15,
                height: 15,
                fill: 'none',
                stroke: 'var(--canvas)',
                strokeWidth: 2.2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }}
            >
              <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
              <path d="M3 7l9 4 9-4M12 11v10" />
            </svg>
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
              Aurelian Collective
            </div>
            <div
              className="mono"
              style={{ fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}
            >
              FREIGHT AUDIT
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {NAV_LINKS.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--ink-2)',
                textDecoration: 'none',
                transition: 'background 0.1s',
              }}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/login"
            style={{
              marginLeft: 12,
              padding: '7px 18px',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--ink)',
              color: 'var(--canvas)',
              textDecoration: 'none',
              transition: 'opacity 0.1s',
            }}
          >
            Sign In
          </Link>
        </nav>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '40px 24px 32px',
          background: 'var(--surface-sunk)',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 48,
            justifyContent: 'space-between',
            maxWidth: 1100,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>
              Aurelian Collective
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 280 }}>
              Post-shipment freight audit and pre-shipment compliance intelligence for shippers moving high-value goods.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Product
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Audit Engine', 'Dispute Recovery', 'Compliance Gateway', 'Pricing'].map((l) => (
                  <Link
                    key={l}
                    href={`/${l.toLowerCase().replace(/\s+/g, '-')}`}
                    style={{ fontSize: 12.5, color: 'var(--ink-2)', textDecoration: 'none' }}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Company
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['About', 'Blog', 'Contact'].map((l) => (
                  <Link
                    key={l}
                    href={`/${l.toLowerCase()}`}
                    style={{ fontSize: 12.5, color: 'var(--ink-2)', textDecoration: 'none' }}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            width: '100%',
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
            fontSize: 11,
            color: 'var(--ink-faint)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>© {new Date().getFullYear()} Aurelian Collective, Inc.</span>
          <span>aureliancollective.io</span>
        </div>
      </footer>
    </div>
  );
}
