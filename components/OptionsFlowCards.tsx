'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OptionsFlow {
  id: string;
  ticker: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  isUnusual: boolean;
  impliedVol: number;
  delta: number;
  spot: number;
  premium: number;
}

function daysToExpiry(expiry: string) {
  return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000));
}

function formatVol(v: number) {
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v);
}

export default function OptionsFlowCards() {
  const [flows, setFlows]     = useState<OptionsFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScan, setLastScan] = useState('');

  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch('/api/options-tape', { cache: 'no-store' });
      const data = await res.json();
      if (data.tape?.length) setFlows(data.tape.slice(0, 30));
      setLastScan(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true }));
    } catch (e) {
      console.error('[options-flow]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
    const interval = setInterval(fetchFlows, 25000);
    return () => clearInterval(interval);
  }, [fetchFlows]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-4">
        <div className="pulse-dot" style={{ width: 12, height: 12 }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading options flow...</p>
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="text-4xl">⚡</div>
        <div className="text-center">
          <p className="font-semibold text-white mb-1">No options flow data</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Options flow appears during market hours (9:30 AM – 4 PM ET)</p>
        </div>
      </div>
    );
  }

  const unusual = flows.filter(f => f.isUnusual);
  const normal  = flows.filter(f => !f.isUnusual);

  return (
    <div>
      {lastScan && (
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Last updated: {lastScan} · Auto-refreshes every 25s</p>
      )}

      {/* Unusual section */}
      {unusual.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-white">⚡ Unusual Activity</span>
            <span className="pill pill-watch text-[11px] px-2 py-0.5">{unusual.length} contracts</span>
          </div>
          <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <AnimatePresence>
              {unusual.map((flow, i) => <FlowCard key={flow.id} flow={flow} i={i} />)}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Normal section */}
      {normal.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>All Options Flow</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <AnimatePresence>
              {normal.map((flow, i) => <FlowCard key={flow.id} flow={flow} i={i} />)}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function FlowCard({ flow, i }: { flow: OptionsFlow; i: number }) {
  const isCall = flow.type === 'call';
  const accentColor = isCall ? 'var(--buy)' : 'var(--sell)';
  const dte = daysToExpiry(flow.expiry);

  return (
    <motion.div
      className="flow-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, delay: i * 0.03 }}
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-base text-white">{flow.ticker}</span>
        <span className={`pill ${isCall ? 'pill-call' : 'pill-put'} text-[11px] px-2 py-0.5`}>
          {isCall ? '↑ CALL' : '↓ PUT'}
        </span>
      </div>

      {/* Strike + Expiry */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Strike Price</div>
          <div className="text-sm font-bold num" style={{ color: accentColor }}>
            ${flow.strike.toFixed(flow.strike < 10 ? 2 : 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Expires</div>
          <div className="text-xs num text-white">{flow.expiry.slice(5)}</div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dte} days left</div>
        </div>
      </div>

      {/* Vol / OI */}
      <div className="flex items-center justify-between pt-2.5" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Volume</div>
          <div className="text-xs font-semibold num text-white">{formatVol(flow.volume)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Vol/OI Ratio</div>
          <div className="text-xs font-bold num" style={{ color: flow.volumeOIRatio > 1 ? 'var(--watch)' : 'var(--text-muted)' }}>
            {flow.volumeOIRatio.toFixed(1)}x
          </div>
        </div>
      </div>

      {flow.isUnusual && (
        <div className="mt-2 pt-2 text-center" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <span className="pill pill-watch text-[10px] px-2 py-0.5">⚡ Unusual — Big Money Alert</span>
        </div>
      )}
    </motion.div>
  );
}
