'use client';

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: 'var(--bg-base)', minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', color: 'var(--text-primary)', fontFamily: '"Inter", sans-serif' }}>
      
      {/* Decorative Glows (Brighter and Softer for Light Mode) */}
      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 600, borderRadius: '50%', background: 'rgba(52, 199, 89, 0.1)', filter: 'blur(120px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'rgba(0, 122, 255, 0.08)', filter: 'blur(120px)', pointerEvents: 'none' }} />

      <main style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px', maxWidth: 900 }}>
        
        <div className="glass" style={{ marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 100, fontSize: 13, fontWeight: 700, color: 'var(--buy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--buy)', boxShadow: '0 0 10px var(--buy)', flexShrink: 0, animation: 'pulse-dot 2s ease-in-out infinite' }} />
          Live execution engines online
        </div>

        <h1 style={{ fontSize: 'clamp(40px, 6vw, 84px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 24, lineHeight: 1.1 }}>
          Institutional Options Flow.<br />
          <span style={{ 
            background: 'var(--accent-grad)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent'
          }}>
            Distilled.
          </span>
        </h1>

        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--text-secondary)', marginBottom: 44, maxWidth: 680, lineHeight: 1.6, fontWeight: 500 }}>
          A zero-noise quantitative scanner tracking Anomalous Premium Breakouts in real-time. Uncover structural market advantages before the institutional sweep settles.
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/terminal" style={{ textDecoration: 'none' }}>
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '16px 36px', background: 'var(--accent-grad)',
              color: '#ffffff', fontSize: 18, fontWeight: 800, borderRadius: 100,
              boxShadow: '0 8px 24px -8px rgba(0, 122, 255, 0.4)', cursor: 'pointer', transition: 'all 0.2s ease'
             }} 
             onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(0, 122, 255, 0.6)'; }}
             onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(0, 122, 255, 0.4)'; }}
             >
              Launch Terminal
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          <button className="glass" style={{ 
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px 36px', color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, borderRadius: 100, cursor: 'pointer', transition: 'all 0.2s ease'
           }}
           onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-card2)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
           onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.transform = 'scale(1)'; }}
           onClick={() => alert("Methodology: Anomalous option block detection via instantaneous RVOL aggregates")}
           >
            Explore Methodology
          </button>
        </div>
      </main>

      <div style={{ position: 'absolute', bottom: 40, left: 0, width: '100%', display: 'flex', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        Stoption Quantitative Systems © {new Date().getFullYear()}
      </div>
    </div>
  );
}
