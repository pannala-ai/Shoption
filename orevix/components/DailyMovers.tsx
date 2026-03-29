'use client';

import { useEffect, useState, useCallback } from 'react';

interface Mover {
  ticker: string;
  price: number;
  change: number;
  changeDollar: number;
  volume: number;
  rvol: number;
  vwap: number;
  high: number;
  low: number;
}

interface DailyMoversProps {
  onTickerSelect: (ticker: string) => void;
  activeTicker: string;
}

export default function DailyMovers({ onTickerSelect, activeTicker }: DailyMoversProps) {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'rvol' | 'change' | 'volume'>('rvol');
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');

  const fetchMovers = useCallback(async () => {
    try {
      const res = await fetch('/api/movers', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setMovers(data.movers ?? []);
      const now = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      setLastUpdate(now);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovers();
    const interval = setInterval(fetchMovers, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchMovers]);

  const sorted = [...movers].sort((a, b) => {
    if (sortBy === 'rvol')   return b.rvol - a.rvol;
    if (sortBy === 'change') return Math.abs(b.change) - Math.abs(a.change);
    return b.volume - a.volume;
  });

  const formatVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(v);
  };

  const rvolColor = (rvol: number) =>
    rvol >= 5 ? '#ff8c00' : rvol >= 3 ? '#00ff00' : rvol >= 1.5 ? '#ffd700' : '#71717a';

  const rvolPct = (rvol: number) => Math.min(100, (rvol / 6) * 100);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#000' }}>
      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div className="flex items-center gap-2">
          <span className="pulse inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
          DAILY MOVERS
        </div>
        <span className="mono text-zinc-600 text-[9px]">{lastUpdate}</span>
      </div>

      {/* Sort Tabs */}
      <div className="flex border-b" style={{ borderColor: '#27272a', flexShrink: 0 }}>
        {(['rvol', 'change', 'volume'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className="flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-widest transition-colors mono"
            style={{
              color: sortBy === s ? '#00ff00' : '#52525b',
              borderBottom: sortBy === s ? '2px solid #00ff00' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {s === 'rvol' ? 'RVOL' : s === 'change' ? '% CHG' : 'VOL'}
          </button>
        ))}
      </div>

      {/* Movers List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-zinc-600 text-xs mono">
            SCANNING MARKET DATA...
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-zinc-600 text-xs mono">
            NO DATA AVAILABLE
          </div>
        ) : (
          sorted.map((m) => {
            const isBull = m.change >= 0;
            const isActive = m.ticker === activeTicker;
            const rv = m.rvol;
            const rc = rvolColor(rv);

            return (
              <button
                key={m.ticker}
                onClick={() => onTickerSelect(m.ticker)}
                className="w-full text-left transition-colors"
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid rgba(39,39,42,0.5)',
                  background: isActive ? 'rgba(124,58,237,0.08)' : 'transparent',
                  borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {/* Row 1: Ticker + Price + Change */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="mono font-bold text-xs text-white">{m.ticker}</span>
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs text-zinc-300">${m.price.toFixed(2)}</span>
                    <span
                      className="mono text-[10px] font-semibold"
                      style={{ color: isBull ? '#00ff00' : '#ff3333' }}
                    >
                      {isBull ? '+' : ''}{m.change.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Row 2: RVOL bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 rvol-bar">
                    <div
                      className="rvol-fill"
                      style={{ width: `${rvolPct(rv)}%`, background: rc }}
                    />
                  </div>
                  <span className="mono text-[10px] font-bold" style={{ color: rc, minWidth: '36px', textAlign: 'right' }}>
                    {rv}x
                  </span>
                </div>

                {/* Row 3: Volume */}
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-zinc-600 mono">VOL {formatVol(m.volume)}</span>
                  <span className="text-[9px] text-zinc-600 mono">VWAP ${m.vwap?.toFixed(2) ?? '--'}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="panel-header border-t border-b-0" style={{ justifyContent: 'center' }}>
        <span className="text-[9px] text-zinc-700 mono">AUTO-REFRESH 15S · {movers.length} TICKERS</span>
      </div>
    </div>
  );
}
