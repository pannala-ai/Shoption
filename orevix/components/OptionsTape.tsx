'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OptionsRow {
  id: string;
  ticker: string;
  contractTicker: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  isUnusual: boolean;
  isOTM: boolean;
  impliedVol: number;
  delta: number;
  gamma: number;
  spot: number;
  premium: number;
  timestamp: number;
}

interface OptionsTapeProps {
  activeTicker: string;
  onTickerSelect: (ticker: string) => void;
}

export default function OptionsTape({ activeTicker, onTickerSelect }: OptionsTapeProps) {
  const [tape, setTape] = useState<OptionsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'calls' | 'puts' | 'unusual'>('all');
  const [tickerFilter, setTickerFilter] = useState('');
  const [lastRefresh, setLastRefresh] = useState('--:--:--');

  const fetchTape = useCallback(async () => {
    try {
      const res = await fetch('/api/options-tape', { cache: 'no-store' });
      const data = await res.json();
      if (data.tape?.length) {
        setTape((prev) => {
          // Merge and deduplicate by contractTicker, keeping newest
          const incoming = data.tape as OptionsRow[];
          const map = new Map<string, OptionsRow>();
          for (const r of [...prev, ...incoming]) map.set(r.contractTicker, { ...r, timestamp: Date.now() });
          return Array.from(map.values())
            .sort((a, b) => {
              if (a.isUnusual && !b.isUnusual) return -1;
              if (!a.isUnusual && b.isUnusual) return 1;
              return b.volume - a.volume;
            })
            .slice(0, 80);
        });
      }
      const now = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      setLastRefresh(now);
    } catch (e) {
      console.error('[options-tape]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTape();
    const interval = setInterval(fetchTape, 20000);
    return () => clearInterval(interval);
  }, [fetchTape]);

  // Filter displayed rows
  const visible = tape.filter((r) => {
    if (filter === 'calls' && r.type !== 'call') return false;
    if (filter === 'puts'  && r.type !== 'put')  return false;
    if (filter === 'unusual' && !r.isUnusual)     return false;
    if (tickerFilter && !r.ticker.includes(tickerFilter.toUpperCase())) return false;
    return true;
  });

  const formatVol = (v: number) =>
    v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v);

  const daysToExpiry = (expiry: string) => {
    const diff = new Date(expiry).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div className="flex items-center gap-2">
          <span className="pulse inline-block w-1.5 h-1.5 rounded-full bg-purple-400" />
          OPTIONS TAPE
        </div>
        <span className="mono text-zinc-700 text-[9px]">{lastRefresh}</span>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: '#27272a', flexShrink: 0 }}>
        {(['all', 'calls', 'puts', 'unusual'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2 py-0.5 rounded text-[9px] mono uppercase font-semibold transition-colors"
            style={{
              background: filter === f
                ? f === 'calls'   ? 'rgba(0,255,0,0.1)'
                : f === 'puts'    ? 'rgba(255,51,51,0.1)'
                : f === 'unusual' ? 'rgba(255,215,0,0.1)'
                : 'rgba(255,255,255,0.06)'
                : 'transparent',
              color: filter === f
                ? f === 'calls' ? '#00ff00' : f === 'puts' ? '#ff3333' : f === 'unusual' ? '#ffd700' : '#e4e4e7'
                : '#52525b',
              border: `1px solid ${
                filter === f
                  ? f === 'calls' ? '#00ff0040' : f === 'puts' ? '#ff333340' : f === 'unusual' ? '#ffd70040' : '#27272a'
                  : '#27272a'
              }`,
              cursor: 'pointer',
            }}
          >
            {f === 'unusual' ? '⚡ UOA' : f.toUpperCase()}
          </button>
        ))}
        <input
          type="text"
          placeholder="Filter ticker..."
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          className="search-input ml-auto px-2 py-0.5"
          style={{ width: '90px', fontSize: '10px' }}
        />
      </div>

      {/* Column Headers */}
      <div
        className="grid gap-0 mono text-[8px] text-zinc-700 uppercase tracking-wider font-semibold px-2 py-1 border-b flex-shrink-0"
        style={{
          borderColor: '#27272a',
          gridTemplateColumns: '40px 50px 52px 44px 44px 40px 36px 44px',
          background: '#060606',
        }}
      >
        <span>TKTR</span>
        <span className="text-right">STRIKE</span>
        <span>EXPIRY</span>
        <span className="text-right">VOL</span>
        <span className="text-right">OI</span>
        <span className="text-right">V/OI</span>
        <span className="text-right">Δ</span>
        <span className="text-right">IV%</span>
      </div>

      {/* Tape Rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-zinc-600 text-xs mono">
            LOADING OPTIONS FLOW...
          </div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-zinc-700 text-[10px] mono">
            NO OPTIONS MATCHING FILTER
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((row) => {
              const isCall = row.type === 'call';
              const dte = daysToExpiry(row.expiry);
              const rowColor = isCall ? '#00ff00' : '#ff3333';
              const bg = row.isUnusual
                ? isCall ? 'rgba(0,255,0,0.04)' : 'rgba(255,51,51,0.04)'
                : 'transparent';

              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => onTickerSelect(row.ticker)}
                  className="grid gap-0 items-center px-2 py-1 mono text-[10px] cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: '40px 50px 52px 44px 44px 40px 36px 44px',
                    borderBottom: '1px solid rgba(39,39,42,0.4)',
                    background: bg,
                    borderLeft: row.isUnusual ? `2px solid ${rowColor}` : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = bg; }}
                >
                  {/* Ticker + Type */}
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-white text-[9px]">{row.ticker}</span>
                    <span className={`badge text-[8px] px-1 py-0 ${isCall ? 'badge-call' : 'badge-put'}`}>
                      {isCall ? 'C' : 'P'}
                    </span>
                  </div>

                  {/* Strike */}
                  <span className="text-right" style={{ color: rowColor }}>
                    ${row.strike.toFixed(row.strike < 10 ? 2 : 0)}
                  </span>

                  {/* Expiry + DTE */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-400 text-[9px]">{row.expiry.slice(5)}</span>
                    <span className="text-zinc-700 text-[8px]">{dte}d</span>
                  </div>

                  {/* Volume */}
                  <span className="text-right text-zinc-300">{formatVol(row.volume)}</span>

                  {/* OI */}
                  <span className="text-right text-zinc-600">{formatVol(row.openInterest)}</span>

                  {/* V/OI */}
                  <span
                    className="text-right font-bold"
                    style={{ color: row.volumeOIRatio > 1 ? '#ffd700' : '#71717a' }}
                  >
                    {row.volumeOIRatio.toFixed(1)}x
                  </span>

                  {/* Delta */}
                  <span
                    className="text-right"
                    style={{ color: Math.abs(row.delta) > 0.5 ? rowColor : '#71717a' }}
                  >
                    {row.delta.toFixed(2)}
                  </span>

                  {/* IV */}
                  <span
                    className="text-right"
                    style={{ color: row.impliedVol > 0.6 ? '#ff8c00' : '#71717a' }}
                  >
                    {(row.impliedVol * 100).toFixed(0)}%
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div className="panel-header border-t border-b-0" style={{ justifyContent: 'space-between' }}>
        <span className="text-[9px] text-zinc-700 mono">{visible.length} CONTRACTS · AUTO-REFRESH 20S</span>
        <div className="flex gap-2 text-[9px] mono">
          <span style={{ color: '#00ff00' }}>■ CALLS</span>
          <span style={{ color: '#ff3333' }}>■ PUTS</span>
          <span style={{ color: '#ffd700' }}>⚡ UOA</span>
        </div>
      </div>
    </div>
  );
}
