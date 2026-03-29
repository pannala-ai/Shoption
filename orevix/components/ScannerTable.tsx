'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ScanResult {
  ticker: string;
  price: number;
  change: number;
  changeDollar: number;
  volume: number;
  rvol: number;
  vwap: number;
  high: number;
  low: number;
  signal: 'BUY' | 'SELL' | 'WATCH' | 'NONE';
  signalStrength: number;
  reason: string;
}

export default function ScannerTable() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalScanned, setTotalScanned] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('');
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'watch'>('all');
  const prevTickers = useRef<Set<string>>(new Set());

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch('/api/scan', { cache: 'no-store' });
      if (!res.ok) throw new Error('scan failed');
      const data = await res.json();
      setResults(data.results ?? []);
      setTotalScanned(data.totalScanned ?? 0);
      setSignalCount(data.signals ?? 0);
      const now = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setLastUpdate(now);

      // Track new signals for flash animation
      const newSet = new Set(
        (data.results ?? [])
          .filter((r: ScanResult) => r.signal === 'BUY' || r.signal === 'SELL')
          .map((r: ScanResult) => r.ticker)
      );
      prevTickers.current = newSet;
    } catch (e) {
      console.error('[scan]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScan();
    const interval = setInterval(fetchScan, 12000);
    return () => clearInterval(interval);
  }, [fetchScan]);

  const filtered = results.filter((r) => {
    if (filter === 'buy') return r.signal === 'BUY';
    if (filter === 'sell') return r.signal === 'SELL';
    if (filter === 'watch') return r.signal === 'WATCH';
    return true;
  });

  const formatVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(v);
  };

  const rvolColor = (rvol: number) =>
    rvol >= 5 ? '#f59e0b' : rvol >= 3 ? '#10b981' : rvol >= 1.5 ? '#3b82f6' : '#475569';

  const signalPillClass = (signal: string) => {
    if (signal === 'BUY') return 'pill pill-buy';
    if (signal === 'SELL') return 'pill pill-sell';
    if (signal === 'WATCH') return 'pill pill-unusual';
    return 'pill pill-neutral';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Stats Bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="stat-card flex items-center gap-3 px-4 py-2">
          <div className="pulse-dot" style={{ width: 6, height: 6 }} />
          <div>
            <div className="text-xs text-slate-400">Scanning</div>
            <div className="text-lg font-bold num">{totalScanned}</div>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3 px-4 py-2">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: signalCount > 0 ? '#10b981' : '#475569' }} />
          <div>
            <div className="text-xs text-slate-400">Active Signals</div>
            <div className="text-lg font-bold num" style={{ color: signalCount > 0 ? '#10b981' : '#94a3b8' }}>{signalCount}</div>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3 px-4 py-2">
          <div>
            <div className="text-xs text-slate-400">Last Scan</div>
            <div className="text-sm font-medium num text-slate-300">{lastUpdate || '--'}</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {(['all', 'buy', 'sell', 'watch'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-all"
              style={{
                background: filter === f
                  ? f === 'buy' ? 'var(--green-soft)' : f === 'sell' ? 'var(--red-soft)' : f === 'watch' ? 'var(--yellow-soft)' : 'rgba(255,255,255,0.06)'
                  : 'transparent',
                color: filter === f
                  ? f === 'buy' ? 'var(--green)' : f === 'sell' ? 'var(--red)' : f === 'watch' ? 'var(--yellow)' : 'var(--text-primary)'
                  : 'var(--text-muted)',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              {f === 'all' ? `All (${results.length})` : f === 'buy' ? `Buy (${results.filter(r => r.signal === 'BUY').length})` : f === 'sell' ? `Sell (${results.filter(r => r.signal === 'SELL').length})` : `Watch (${results.filter(r => r.signal === 'WATCH').length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Column Headers ── */}
      <div
        className="grid gap-0 text-xs font-semibold uppercase tracking-wider px-5 py-2 flex-shrink-0"
        style={{
          color: 'var(--text-dim)',
          borderBottom: '1px solid var(--border)',
          gridTemplateColumns: '100px 90px 80px 70px 80px 1fr 100px',
          background: 'var(--bg-surface)',
        }}
      >
        <span>Ticker</span>
        <span className="text-right">Price</span>
        <span className="text-right">Change</span>
        <span className="text-right">RVOL</span>
        <span className="text-right">Volume</span>
        <span className="pl-4">Signal</span>
        <span className="text-center">Strength</span>
      </div>

      {/* ── Scanner Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="pulse-dot" />
            <p className="text-sm text-slate-500">Scanning market...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-sm text-slate-500">
              {filter !== 'all' ? `No ${filter.toUpperCase()} signals right now` : 'No data available — market may be closed'}
            </p>
          </div>
        ) : (
          filtered.map((r) => {
            const isBuy = r.signal === 'BUY';
            const isSell = r.signal === 'SELL';
            const hasSignal = isBuy || isSell;
            const changeColor = r.change >= 0 ? 'var(--green)' : 'var(--red)';

            return (
              <div
                key={r.ticker}
                className={`grid gap-0 items-center px-5 py-3 transition-all ${hasSignal ? (isBuy ? 'flash-buy' : 'flash-sell') : ''}`}
                style={{
                  gridTemplateColumns: '100px 90px 80px 70px 80px 1fr 100px',
                  borderBottom: '1px solid rgba(55, 65, 81, 0.3)',
                  borderLeft: hasSignal ? `3px solid ${isBuy ? 'var(--green)' : 'var(--red)'}` : '3px solid transparent',
                  background: hasSignal ? (isBuy ? 'rgba(16,185,129,0.03)' : 'rgba(239,68,68,0.03)') : 'transparent',
                  cursor: 'default',
                }}
              >
                {/* Ticker */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{r.ticker}</span>
                </div>

                {/* Price */}
                <span className="text-right text-sm font-medium num text-slate-200">
                  ${r.price.toFixed(2)}
                </span>

                {/* Change */}
                <span className="text-right text-sm font-semibold num" style={{ color: changeColor }}>
                  {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
                </span>

                {/* RVOL */}
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-semibold num" style={{ color: rvolColor(r.rvol) }}>
                    {r.rvol.toFixed(1)}x
                  </span>
                  <div className="rvol-bar" style={{ width: '40px' }}>
                    <div className="rvol-fill" style={{ width: `${Math.min(100, (r.rvol / 5) * 100)}%`, background: rvolColor(r.rvol) }} />
                  </div>
                </div>

                {/* Volume */}
                <span className="text-right text-xs num text-slate-400">
                  {formatVol(r.volume)}
                </span>

                {/* Signal + Reason */}
                <div className="flex items-center gap-3 pl-4">
                  {r.signal !== 'NONE' && (
                    <>
                      <span className={signalPillClass(r.signal)}>{r.signal}</span>
                      <span className="text-xs text-slate-500 truncate">{r.reason}</span>
                    </>
                  )}
                </div>

                {/* Strength Bar */}
                <div className="flex items-center justify-center">
                  {r.signalStrength > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(55,65,81,0.5)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${r.signalStrength}%`,
                            background: isBuy ? 'var(--green)' : isSell ? 'var(--red)' : 'var(--blue)',
                          }}
                        />
                      </div>
                      <span className="text-xs num text-slate-500">{r.signalStrength}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-5 py-2 flex-shrink-0 text-xs text-slate-600" style={{ borderTop: '1px solid var(--border)' }}>
        <span>Auto-refresh every 12s · {filtered.length} tickers shown</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span style={{ color: 'var(--green)' }}>●</span> BUY
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ color: 'var(--red)' }}>●</span> SELL
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ color: 'var(--yellow)' }}>●</span> WATCH
          </span>
        </div>
      </div>
    </div>
  );
}
