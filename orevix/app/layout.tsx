// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orevix — AI Stock & Options Scanner',
  description: 'AI-powered real-time stock and options scanner. Get instant BUY/SELL signals powered by RVOL, VWAP, and unusual options activity.',
  keywords: ['stock scanner', 'options scanner', 'AI trading', 'buy sell signals', 'unusual options activity'],
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <meta name="theme-color" content="#06080f" />
      </head>
      <body className="overflow-hidden h-screen w-screen antialiased"
        style={{ background: '#06080f', color: '#f1f5f9' }}>
        {children}
      </body>
    </html>
  );
}
