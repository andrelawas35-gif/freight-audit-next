/*
  app/(marketing)/page.tsx — Aurelian Collective marketing homepage.
  
  Hero → Value props → How it works → CTA. Clean, conversion-focused.
  All inline styles use the existing design token variables.
*/

import Link from 'next/link';

const FEATURES = [
  {
    title: 'Carrier Invoice Audit',
    body: 'Parcel, LTL, and 3PL engines detect overcharges across dim-weight, accessorial, duplicate, and SLA violations — automatically.',
    icon: 'flag',
  },
  {
    title: 'Dispute Recovery',
    body: 'End-to-end dispute lifecycle: file, track carrier responses, parse outcomes. Templates and bulk operations keep your team fast.',
    icon: 'gavel',
  },
  {
    title: 'Compliance Intelligence',
    body: 'Insurance gap detection, warehouse SOP scoring, carrier authorization checks. Know your risk before it becomes a loss.',
    icon: 'shield',
  },
  {
    title: 'Gateway Readiness',
    body: 'Simulate pre-shipment enforcement. See what you would have saved if rules had been active before label purchase.',
    icon: 'eye',
  },
];

const STEPS = [
  { step: '1', title: 'Connect', body: 'Upload carrier invoices, 3PL cycles, or connect via SFTP / EDI 210.' },
  { step: '2', title: 'Audit', body: 'Our engine runs 30+ rules across every shipment line. Findings are scored and prioritized.' },
  { step: '3', title: 'Recover', body: 'File disputes directly from findings. Track carrier responses and recovery dollars in real time.' },
];

export default function MarketingHomepage() {
  return (
    <>
      {/* ── Hero ── */}
      <section
        style={{
          padding: '80px 24px 64px',
          textAlign: 'center',
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'var(--amber-soft, rgba(245,158,11,0.1))',
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--amber)',
            marginBottom: 24,
            letterSpacing: '0.03em',
          }}
        >
          Now in beta — accepting early access clients
        </div>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            margin: '0 0 16px',
            color: 'var(--ink)',
          }}
        >
          Every dollar your carrier owes you,<br />
          <span style={{ color: 'var(--amber)' }}>found and recovered.</span>
        </h1>
        <p
          style={{
            fontSize: 16,
            color: 'var(--ink-2)',
            lineHeight: 1.6,
            maxWidth: 520,
            margin: '0 auto 32px',
          }}
        >
          Post-shipment freight audit for high-value goods shippers. We find overcharges
          parcel audit tools miss — then turn every finding into a behavioral signal that
          prevents future loss.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/signup"
            style={{
              padding: '12px 28px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              background: 'linear-gradient(150deg, var(--amber) 0%, var(--hot) 120%)',
              color: 'var(--canvas)',
              textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(245,158,11,0.3)',
            }}
          >
            Request Early Access
          </Link>
          <Link
            href="/about"
            style={{
              padding: '12px 28px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--surface)',
              color: 'var(--ink)',
              textDecoration: 'none',
              border: '1px solid var(--line)',
            }}
          >
            How It Works
          </Link>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section
        style={{
          padding: '64px 24px',
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            marginBottom: 40,
            color: 'var(--ink)',
          }}
        >
          Purpose-built for high-value goods shippers
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                padding: '28px 24px',
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--amber-soft, rgba(245,158,11,0.12))',
                  display: 'grid',
                  placeItems: 'center',
                  marginBottom: 16,
                  fontSize: 16,
                  color: 'var(--amber)',
                }}
              >
                {ICONS[f.icon]}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: 'var(--ink)' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        style={{
          padding: '64px 24px',
          background: 'var(--surface-sunk)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2
            style={{
              textAlign: 'center',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.015em',
              marginBottom: 40,
              color: 'var(--ink)',
            }}
          >
            How it works
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 28,
            }}
          >
            {STEPS.map((s) => (
              <div key={s.step} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: 'var(--ink)',
                    color: 'var(--canvas)',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 14px',
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  {s.step}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 'clamp(22px, 4vw, 30px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
            color: 'var(--ink)',
          }}
        >
          Ready to stop leaving money with your carriers?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            margin: '0 auto 28px',
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          Early access clients get priority onboarding and zero platform fees through September.
        </p>
        <Link
          href="/signup"
          style={{
            display: 'inline-block',
            padding: '13px 32px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            background: 'linear-gradient(150deg, var(--amber) 0%, var(--hot) 120%)',
            color: 'var(--canvas)',
            textDecoration: 'none',
            boxShadow: '0 2px 16px rgba(245,158,11,0.35)',
          }}
        >
          Request Early Access
        </Link>
      </section>
    </>
  );
}

/* ── Mini inline SVG icons ── */
const ICONS: Record<string, React.ReactNode> = {
  flag: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  gavel: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 13l-7.5 7.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L11 10" />
      <path d="M16 16l6-6" />
      <path d="M8 8l6-6" />
      <path d="M9 7l8 8" />
      <path d="M21 11l-2-2" />
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  eye: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};
