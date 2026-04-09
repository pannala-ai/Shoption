// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STOPTION — Institutional Options Terminal',
  description: 'Ultra-fast, zero-noise, mathematically validated options execution scanner.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <meta name="theme-color" content="#000000" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased"
        style={{ 
          background: 'var(--bg-base)', 
          color: 'var(--text-primary)', 
          fontFamily: '"Inter", sans-serif',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          height: '100vh',
          width: '100vw'
        }}>
        {children}
      </body>
    </html>
  );
}
