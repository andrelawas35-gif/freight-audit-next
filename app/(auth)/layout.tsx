import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-portal
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#020203',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Radial overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 30%, #0a0a0f 0%, #050506 50%, #020203 100%)',
      }} />

      {/* Animated blob 1 */}
      <div style={{
        position: 'absolute',
        top: '15%', left: '55%',
        width: 500, height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(94,106,210,0.15) 0%, transparent 70%)',
        filter: 'blur(140px)',
        animation: 'portalBlobDrift1 14s ease-in-out infinite',
        zIndex: 0,
      }} />

      {/* Animated blob 2 */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '30%',
        width: 400, height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(129,140,248,0.1) 0%, transparent 70%)',
        filter: 'blur(100px)',
        animation: 'portalBlobDrift2 18s ease-in-out infinite',
        zIndex: 0,
      }} />

      <div style={{ width: 'min(380px, calc(100vw - 32px))', position: 'relative', zIndex: 1 }}>
        {/* Header: logo + brand */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <Image src="/logo-mark.svg" alt="" width={26} height={26} />
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: '#EDEDEF',
            }}>
              Aurelian Collective
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Freight Audit &middot; Client Portal
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
            padding: 28,
            animation: 'portalFadeRise 0.5s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
