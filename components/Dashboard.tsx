'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AlertToast from './AlertToast';

// ── Types ─────────────────────────────────────────────────────
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
  isAfterHours?: boolean;
  detectedAt?: string;
  assetType?: 'STOCK' | 'OPTION';
  strategyName?: string;
  strikeLabel?: string;
}

interface OptionsRow {
  id: string;
  ticker: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  isUnusual: boolean;
  premium: number;
  spot: number;
  isGenerated?: boolean;
  timestamp?: number;
}

interface PastTrade {
  id: string;
  ticker: string;
  signal: 'BUY' | 'SELL';
  price: number;
  reason: string;
  strength: number;
  time: string;
  date: string;
  timestamp: number;
  assetType?: 'STOCK' | 'OPTION';
  strategyName?: string;
  strikeLabel?: string;
}

interface PinnedTrade extends PastTrade {
  pinnedAt: number;
  exitDate?: string;
  exitTime?: string;
}

// ── Helpers ───────────────────────────────────────────────────
const fmt = {
  usd:  (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(2)}`,
  vol:  (n: number) => n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n || 0),
  pct:  (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%',
  dte:  (exp: string) => Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000)),
};

function marketStatus() {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 570 && mins < 960)  return { label: 'Open',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (mins >= 240 && mins < 570)  return { label: 'Pre-Market', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (mins >= 960 && mins < 1200) return { label: 'After Hours',color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return { label: 'Closed', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' };
}

// ── Small sub-components ──────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const cfg = {
    BUY:   { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.4)',  label: '↑ BUY'   },
    SELL:  { bg: 'rgba(244,63,94,0.15)',  color: '#f43f5e', border: 'rgba(244,63,94,0.4)',  label: '↓ SELL'  },
    WATCH: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)', label: '● WATCH' },
    NONE:  { bg: 'transparent',           color: '#4e5d73', border: 'transparent',           label: '—'       },
  }[signal] ?? { bg:'transparent',color:'#4e5d73',border:'transparent',label:'—' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 11px',
      borderRadius: 100, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      boxShadow: signal === 'BUY' || signal === 'SELL' ? `0 0 12px ${cfg.border}` : 'none',
    }}>
      {cfg.label}
    </span>
  );
}

function StrengthBar({ value, signal }: { value: number; signal: string }) {
  const color = signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#f43f5e' : '#f59e0b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748b', minWidth: 24 }}>{value}%</span>
    </div>
  );
}

// ── Signal Card (main scanner card) ──────────────────────────
function SignalCard({ r, isNew, onPin }: { r: ScanResult; isNew: boolean; onPin: (t: PinnedTrade) => void }) {
  const isBuy  = r.signal === 'BUY';
  const isSell = r.signal === 'SELL';
  const accentColor = isBuy ? '#22c55e' : isSell ? '#f43f5e' : r.signal === 'WATCH' ? '#f59e0b' : '#334155';
  const changeColor = r.change >= 0 ? '#22c55e' : '#f43f5e';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      style={{
        background: isBuy
          ? 'linear-gradient(145deg, rgba(34,197,94,0.07) 0%, #111827 50%)'
          : isSell
          ? 'linear-gradient(145deg, rgba(244,63,94,0.07) 0%, #111827 50%)'
          : '#111827',
        border: `1px solid ${r.signal !== 'NONE' ? accentColor + '33' : 'rgba(255,255,255,0.07)'}`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 16,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
        animation: isNew ? `${isBuy ? 'flash-buy' : 'flash-sell'} 0.9s ease-out` : 'none',
      }}
    >
      {/* glow */}
      {(isBuy || isSell) && (
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 120, height: 120,
          borderRadius: '50%', background: `radial-gradient(circle, ${accentColor}18, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Header: Ticker + Asset Badge + signal badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff', lineHeight: 1 }}>{r.ticker}</div>
            {r.assetType && (
              <span style={{ 
                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, 
                background: r.assetType === 'OPTION' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.08)', 
                color: r.assetType === 'OPTION' ? '#a5b4fc' : '#94a3b8', border: '1px solid rgba(255,255,255,0.05)'
              }}>
                {r.assetType}
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f0f4ff', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            ${r.price.toFixed(2)}
            {r.strikeLabel && (
              <span style={{ fontSize: 13, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 100, color: '#cbd5e1' }}>
                ↳ {r.strikeLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: changeColor, marginTop: 2 }}>
            <span style={{ fontSize: 13 }}>{fmt.usd(r.changeDollar)}</span>
            <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 6 }}>Today</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!r.isAfterHours && r.signal !== 'WATCH' && r.signal !== 'NONE' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPin({
                    id: `${r.ticker}-${Date.now()}`, ticker: r.ticker, signal: r.signal as 'BUY'|'SELL',
                    price: r.price, reason: r.reason, strength: r.signalStrength,
                    time: r.detectedAt?.split(', ')[1] || '',
                    date: r.detectedAt?.split(', ')[0] || '',
                    timestamp: Date.now(),
                    assetType: r.assetType, strategyName: r.strategyName, strikeLabel: r.strikeLabel,
                    pinnedAt: Date.now()
                  });
                }}
                style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                📌 PIN
              </button>
            )}
            <SignalBadge signal={r.signal} />
          </div>
          {r.detectedAt && (
            <span style={{ fontSize: 10, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
              🕐 {r.detectedAt}
            </span>
          )}
          {r.isAfterHours && (
            <span style={{ fontSize: 10, color: '#334155' }}>prev day data</span>
          )}
        </div>
      </div>

      {/* Strength meter */}
      {r.signal !== 'NONE' && r.signalStrength > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Signal Strength</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>{r.signalStrength}%</span>
          </div>
          <StrengthBar value={r.signalStrength} signal={r.signal} />
        </div>
      )}

      {/* Volume bar */}
      <div style={{ marginBottom: r.reason ? 12 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Volume · RVOL</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: r.rvol >= 3 ? '#22c55e' : r.rvol >= 1.5 ? '#60a5fa' : '#64748b' }}>
            {fmt.vol(r.volume)} · {r.rvol.toFixed(1)}x
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(100, (r.rvol / 5) * 100)}%`, borderRadius: 2,
            background: r.rvol >= 3 ? '#22c55e' : r.rvol >= 1.5 ? '#3b82f6' : '#334155',
            transition: 'width 0.5s',
          }} />
        </div>
      </div>

      {/* Signal reason */}
      {r.reason && (
        <div style={{
          marginTop: 12, fontSize: 11, color: '#94a3b8', lineHeight: 1.5,
          padding: '9px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {r.strategyName && <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 3 }}>⚙️ {r.strategyName}</div>}
          <div style={{ color: '#cbd5e1' }}>{r.reason}</div>
        </div>
      )}

      {/* VWAP + High/Low footer */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {[
          { label: 'VWAP', value: r.vwap ? `$${r.vwap.toFixed(2)}` : '—' },
          { label: 'High',  value: r.high ? `$${r.high.toFixed(2)}` : '—' },
          { label: 'Low',   value: r.low  ? `$${r.low.toFixed(2)}`  : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '5px 0' }}>
            <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{value}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Past Trade Row ────────────────────────────────────────────
function PastRow({ t, onPin, currentPrice }: { t: PastTrade; onPin: (t: PinnedTrade) => void; currentPrice?: number }) {
  const isBuy = t.signal === 'BUY';
  const color  = isBuy ? '#22c55e' : '#f43f5e';
  
  let pnlHtml = null;
  if (currentPrice && currentPrice !== t.price) {
    const diff = currentPrice - t.price;
    const pnl = isBuy ? diff : -diff;
    const pnlColor = pnl > 0 ? '#22c55e' : '#f43f5e';
    pnlHtml = (
      <span style={{ fontSize: 11, fontWeight: 700, color: pnlColor, display: 'inline-flex', alignItems: 'center', marginLeft: 6, background: `${pnlColor}15`, padding: '2px 6px', borderRadius: 4 }}>
        {pnl > 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
      </span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '8px 200px 1fr 130px 40px',
        alignItems: 'center',
        gap: 16,
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#f0f4ff' }}>{t.ticker}</span>
        {t.assetType && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: t.assetType === 'OPTION' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.1)', color: t.assetType === 'OPTION' ? '#a5b4fc' : '#94a3b8' }}>{t.assetType}</span>
        )}
        <SignalBadge signal={t.signal} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff', display: 'flex', alignItems: 'center' }}>
          ${t.price.toFixed(2)} 
          {pnlHtml}
          {t.strikeLabel && <span style={{ color: '#a5b4fc', marginLeft: 8 }}>→ {t.strikeLabel}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{t.reason}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>Strength: {t.strength}%</div>
        <div style={{ fontSize: 11, color: '#4e5d73', marginTop: 2 }}>{t.date} · {t.time}</div>
      </div>
      <div style={{ paddingLeft: 10 }}>
        <button
          onClick={() => {
            onPin({ ...t, pinnedAt: Date.now() });
          }}
          style={{ padding: '6px', fontSize: 12, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', transition: 'background 0.2s' }}
          title="Pin Trade"
        >
          📌
        </button>
      </div>
    </motion.div>
  );
}

// ── Options Flow Card ─────────────────────────────────────────
function OptionsCard({ f, i, tz }: { f: OptionsRow; i: number; tz: string }) {
  const isCall = f.type === 'call';
  const color  = isCall ? '#22c55e' : '#f43f5e';
  const dte    = fmt.dte(f.expiry);
  const timeStr = new Date(f.timestamp || Date.now()).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      style={{
        background: '#111827',
        borderTop: `3px solid ${color}`,
        border: `1px solid ${color}22`,
        borderRadius: 14,
        padding: '16px',
        cursor: 'default',
        transition: 'transform 0.15s',
      }}
      whileHover={{ y: -3 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#f0f4ff' }}>{f.ticker}</span>
        <span style={{
          display: 'inline-flex', gap: 4, alignItems: 'center',
          padding: '2px 10px', borderRadius: 100, fontSize: 10, fontWeight: 700,
          background: isCall ? 'rgba(34,197,94,0.12)' : 'rgba(244,63,94,0.12)',
          color, border: `1px solid ${color}33`,
        }}>
          {isCall ? '↑ BUY CALL' : '↓ BUY PUT'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 3 }}>Strike</div>
          <div style={{ fontSize: 15, fontWeight: 700, color }}>
            ${f.strike < 10 ? f.strike.toFixed(2) : f.strike.toFixed(0)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 3 }}>Expires</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{f.expiry.slice(5)}</div>
          <div style={{ fontSize: 10, color: '#4e5d73' }}>{dte} days</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 2 }}>Volume</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff' }}>{fmt.vol(f.volume)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 2 }}>Detected</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{timeStr}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#4e5d73', marginBottom: 2 }}>Vol/OI</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: f.volumeOIRatio > 1 ? '#f59e0b' : '#64748b' }}>
            {f.volumeOIRatio.toFixed(1)}x
          </div>
        </div>
      </div>
      {f.isUnusual && (
        <div style={{
          marginTop: 10, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700,
          color: '#f59e0b', borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          ⚡ Unusual Institutional Activity
        </div>
      )}
      {f.isGenerated && (
        <div style={{
          marginTop: 10, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 500,
          color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          💡 Historical / Generated Data
        </div>
      )}
    </motion.div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────
export default function Dashboard() {
  const [tab,       setTab]       = useState<'scanner'|'past'|'options'|'pinned'>('scanner');
  const [filter,    setFilter]    = useState<'all'|'buy'|'sell'|'watch'>('all');
  const [assetFilter, setAssetFilter] = useState<'all'|'stock'|'option'>('all');
  const [results,   setResults]   = useState<ScanResult[]>([]);
  const [options,   setOptions]   = useState<OptionsRow[]>([]);
  const [past,      setPast]      = useState<PastTrade[]>([]);
  const [pinned,    setPinned]    = useState<PinnedTrade[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [optLoading, setOptLoad]  = useState(true);
  const [scanning,  setScanning]  = useState(false);
  const [stats,     setStats]     = useState({ total: 0, buys: 0, sells: 0, watches: 0 });
  const [lastScan,  setLastScan]  = useState('');
  const [time,      setTime]      = useState('');
  const [mkt,       setMkt]       = useState(marketStatus());
  const [newTickers, setNewTick]  = useState<Set<string>>(new Set());
  const prevSig = useRef<Map<string, string>>(new Map());
  const [tz,        setTz]        = useState('America/New_York');

  // Clock
  useEffect(() => {
    const tick = () => {
      const et = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      setTime(`${et}`);
      setMkt(marketStatus());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  // Load past trades & pinned
  const loadLocals = useCallback(() => {
    try {
      const sp = localStorage.getItem('shoption_past');
      if (sp) setPast(JSON.parse(sp));
      const sn = localStorage.getItem('shoption_pinned');
      if (sn) setPinned(JSON.parse(sn));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadLocals();
    window.addEventListener('storage', loadLocals);
    return () => window.removeEventListener('storage', loadLocals);
  }, [loadLocals]);

  const handlePin = useCallback((t: PinnedTrade) => {
    setPinned(prev => {
      // Ignore if already pinned
      if (prev.find(x => x.id === t.id || (x.ticker === t.ticker && x.signal === t.signal))) return prev;
      const arr = [t, ...prev];
      try { localStorage.setItem('shoption_pinned', JSON.stringify(arr)); } catch {}
      return arr;
    });
  }, []);

  // Scanner fetch
  const fetchScan = useCallback(async () => {
    setScanning(true);
    try {
      const r = await fetch('/api/scan');
      if (!r.ok) return;
      const d = await r.json();
      const data: ScanResult[] = d.results ?? [];
      setResults(data);
      const buys    = data.filter(r => r.signal === 'BUY').length;
      const sells   = data.filter(r => r.signal === 'SELL').length;
      const watches = data.filter(r => r.signal === 'WATCH').length;
      setStats({ total: d.totalScanned ?? data.length, buys, sells, watches });
      setLastScan(new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }));

      // Detect new signals
      const newSet = new Set<string>();
      const newTrades: PastTrade[] = [];
      const etDate = new Date().toLocaleString('en-US', { timeZone: tz, month: 'short', day: '2-digit' });
      const etTime = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short' });
      const nowTimeStr = `${etDate}, ${etTime}`;

      // Check pinned trades for flipped momentum exiting
      setPinned(prevPinned => {
        let updated = false;
        const newPinned = prevPinned.map(p => {
          if (p.exitDate) return p; // already exited
          const match = data.find(d => d.ticker === p.ticker);
          if (match && ((p.signal === 'BUY' && match.signal === 'SELL') || (p.signal === 'SELL' && match.signal === 'BUY'))) {
            updated = true;
            return { ...p, exitDate: etDate, exitTime: etTime };
          }
          return p;
        });
        if (updated) {
          try { localStorage.setItem('shoption_pinned', JSON.stringify(newPinned)); } catch { /* ignore */ }
          return newPinned;
        }
        return prevPinned;
      });

      for (const item of data) {
        item.detectedAt = nowTimeStr;
        const prev = prevSig.current.get(item.ticker);
        const isFirstLoad = prevSig.current.size === 0;
        
        // ONLY trigger 'New Signal' if it actually changed while the dashboard was open (ignore first load dump)
        if ((item.signal === 'BUY' || item.signal === 'SELL') && !isFirstLoad && prev && prev !== item.signal) {
          newSet.add(item.ticker);
          newTrades.push({
            id: `${item.ticker}-${Date.now()}-${Math.random()}`,
            ticker: item.ticker, signal: item.signal,
            price: item.price, reason: item.reason,
            strength: item.signalStrength,
            time: etTime,
            date: etDate,
            timestamp: Date.now(),
            assetType: item.assetType,
            strategyName: item.strategyName,
            strikeLabel: item.strikeLabel,
          });
        }
        prevSig.current.set(item.ticker, item.signal);
      }
      if (newSet.size > 0) setNewTick(newSet);
      if (newTrades.length > 0) {
        setPast(prev => {
          const m = [...newTrades, ...prev].slice(0, 100);
          try { localStorage.setItem('shoption_past', JSON.stringify(m)); } catch { /* ignore */ }
          return m;
        });
      }
    } catch (e) { console.error('[scan]', e); }
    finally { setScanning(false); setLoading(false); }
  }, [tz]);

  // Options fetch
  const fetchOptions = useCallback(async () => {
    try {
      const r = await fetch('/api/options-tape');
      if (!r.ok) return;
      const d = await r.json();
      setOptions(d.tape ?? []);
    } catch (e) { console.error('[options]', e); }
    finally { setOptLoad(false); }
  }, []);

  useEffect(() => { fetchScan(); const id = setInterval(fetchScan, 60000); return () => clearInterval(id); }, [fetchScan]);
  useEffect(() => { 
    // Stagger Options load by 2 seconds so the initial live scanner polygon API rate limit drops don't trigger 429 errors
    const timeoutid = setTimeout(fetchOptions, 2500); 
    const id = setInterval(fetchOptions, 60000); 
    return () => { clearTimeout(timeoutid); clearInterval(id); };
  }, [fetchOptions]);

  const filtered = results.filter(r => {
    if (r.signal === 'NONE') return false;
    if (filter === 'buy' && r.signal !== 'BUY') return false;
    if (filter === 'sell' && r.signal !== 'SELL') return false;
    if (filter === 'watch' && r.signal !== 'WATCH') return false;
    if (assetFilter === 'stock' && r.assetType !== 'STOCK') return false;
    if (assetFilter === 'option' && r.assetType !== 'OPTION') return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#070a12' }}>
      <AlertToast />

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px',
        background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 900, fontSize: 15,
          }}>S</div>
          <div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f0f4ff' }}>Shoption</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 6 }}>AI Scanner</span>
          </div>
        </div>

        {/* Market pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: mkt.bg, border: `1px solid ${mkt.color}44` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: mkt.color, boxShadow: `0 0 8px ${mkt.color}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: mkt.color }}>{mkt.label}</span>
        </div>

        {/* Quick stats */}
        {[
          { label: 'Scanning', value: stats.total, color: '#f0f4ff' },
          { label: '↑ BUY',   value: stats.buys,  color: '#22c55e' },
          { label: '↓ SELL',  value: stats.sells,  color: '#f43f5e' },
          { label: '● WATCH', value: stats.watches, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '6px 14px', minWidth: 64,
          }}>
            <span style={{ fontSize: 10, color: '#4e5d73', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</span>
          </div>
        ))}

        <div style={{ flex: 1 }} />
        {scanning && <span style={{ fontSize: 11, color: '#6366f1' }}>⟳ Scanning...</span>}
        {lastScan && <span style={{ fontSize: 11, color: '#334155' }}>Updated {lastScan}</span>}
        <select 
          value={tz} 
          onChange={e => setTz(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px 8px', fontSize: 11, outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <option value="America/New_York">EST</option>
          <option value="America/Chicago">CST</option>
          <option value="America/Denver">MST</option>
          <option value="America/Los_Angeles">PST</option>
        </select>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>{time}</span>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px',
        background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        {([
          { id: 'scanner', icon: '📡', label: 'Live Scanner',  badge: stats.buys + stats.sells },
          { id: 'past',    icon: '📋', label: 'Past Signals',  badge: past.length },
          { id: 'options', icon: '⚡', label: 'Options Flow',  badge: options.filter(o => o.isUnusual).length },
          { id: 'pinned',  icon: '📌', label: 'Pinned Trades', badge: pinned.length },
        ] as { id: typeof tab; icon: string; label: string; badge: number }[]).map(({ id, icon, label, badge }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px',
              borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, transition: 'all 0.18s',
              background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: active ? '#a5b4fc' : '#475569',
              boxShadow: active ? '0 0 20px rgba(99,102,241,0.12)' : 'none',
            }}>
              <span>{icon}</span>
              <span>{label}</span>
              {badge > 0 && (
                <span style={{
                  padding: '1px 6px', borderRadius: 100, fontSize: 10, fontWeight: 800,
                  background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)',
                  color: active ? '#c4b5fd' : '#64748b',
                }}>{badge}</span>
              )}
            </button>
          );
        })}

        {/* Filter chips (scanner only) */}
        {tab === 'scanner' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: 12 }}>
              {([
                { id: 'all', label: 'All Assets' },
                { id: 'stock', label: 'Stocks' },
                { id: 'option', label: 'Options' },
              ] as { id: typeof assetFilter; label: string }[]).map(({ id, label }) => {
                const active = assetFilter === id;
                return (
                  <button key={id} onClick={() => setAssetFilter(id as any)} style={{
                    padding: '6px 14px', borderRadius: 100, border: `1px solid ${active ? '#6366f155' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? '#a5b4fc' : '#475569',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { id: 'all', label: `All Signals (${filtered.length})` },
                { id: 'buy', label: `↑ Buy (${stats.buys})` },
                { id: 'sell', label: `↓ Sell (${stats.sells})` },
                { id: 'watch', label: `Watch (${stats.watches})` },
              ] as { id: typeof filter; label: string }[]).map(({ id, label }) => {
                const activeFilter = filter === id;
                const chipColor = id === 'buy' ? '#22c55e' : id === 'sell' ? '#f43f5e' : id === 'watch' ? '#f59e0b' : '#f0f4ff';
                return (
                  <button key={id} onClick={() => setFilter(id)} style={{
                    padding: '6px 14px', borderRadius: 100, border: `1px solid ${activeFilter ? chipColor + '55' : 'rgba(255,255,255,0.08)'}`,
                    background: activeFilter ? `${chipColor}15` : 'transparent',
                    color: activeFilter ? chipColor : '#475569',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">

          {/* SCANNER TAB */}
          {tab === 'scanner' && (
            <motion.div key="scanner" style={{ height: '100%', overflowY: 'auto', padding: '24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12 }}>
                  <div className="pulse-dot" style={{ width: 14, height: 14 }} />
                  <p style={{ color: '#475569', fontSize: 14 }}>Scanning 50+ stocks...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 48 }}>📊</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 16 }}>
                    {filter !== 'all' ? `No ${filter.toUpperCase()} signals right now` : 'No active signals detected'}
                  </p>
                  <p style={{ color: '#475569', fontSize: 13 }}>
                    The scanner runs every 15 seconds · Best results Mon–Fri 9:30 AM – 4 PM ET
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {filtered.map(r => <SignalCard key={r.ticker} r={r} isNew={newTickers.has(r.ticker)} onPin={handlePin} />)}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* PAST SIGNALS TAB */}
          {tab === 'past' && (
            <motion.div key="past" style={{ height: '100%', overflowY: 'auto' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{ padding: '20px 24px 12px' }}>
                <div style={{
                  padding: '14px 18px', borderRadius: 14, marginBottom: 20,
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <div>
                    <p style={{ fontWeight: 700, color: '#f0f4ff', marginBottom: 4, fontSize: 14 }}>Signals You Might Have Missed</p>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                      Every BUY or SELL signal detected by Shoption is automatically logged here. Use this to review opportunities and learn the patterns.
                    </p>
                  </div>
                </div>
              </div>

              {past.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40%', gap: 10 }}>
                  <span style={{ fontSize: 40 }}>⏳</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 14 }}>No past signals yet</p>
                  <p style={{ color: '#475569', fontSize: 13 }}>They'll appear as the scanner detects BUY/SELL setups</p>
                </div>
              ) : (
                <>
                  <div style={{ margin: '0 24px', background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '8px 200px 1fr 130px 40px',
                      gap: 16, padding: '10px 24px',
                      background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      <span /><span>Stock</span><span>Signal Reason</span><span style={{ textAlign: 'right' }}>Time & Strength</span><span>Action</span>
                    </div>
                    <AnimatePresence>
                      {past.map(t => <PastRow key={t.id} t={t} onPin={handlePin} currentPrice={results.find(x => x.ticker === t.ticker)?.price} />)}
                    </AnimatePresence>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
                    <button onClick={() => { setPast([]); try { localStorage.removeItem('shoption_past'); } catch { /**/ } }}
                      style={{ padding: '7px 20px', borderRadius: 100, background: 'rgba(244,63,94,0.08)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Clear History
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* OPTIONS FLOW TAB */}
          {tab === 'options' && (
            <motion.div key="options" style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{
                padding: '14px 18px', borderRadius: 14, marginBottom: 20,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#f0f4ff', marginBottom: 4, fontSize: 14 }}>Options Flow — Where Big Money Is Betting</p>
                  <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                    Options flow tracks large bets placed by institutional traders. A high Vol/OI ratio = more contracts traded than normally exist — a strong signal.
                  </p>
                </div>
              </div>

              {optLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                  <p style={{ color: '#475569' }}>Loading options flow...</p>
                </div>
              ) : options.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40%', gap: 10 }}>
                  <span style={{ fontSize: 40 }}>🔍</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 14 }}>No options flow data available</p>
                  <p style={{ color: '#475569', fontSize: 13 }}>Options data shows during market hours 9:30 AM – 4:00 PM ET</p>
                </div>
              ) : (
                <>
                  {options.filter(o => o.isUnusual).length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f4ff' }}>⚡ Unusual Activity</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                          {options.filter(o => o.isUnusual).length} contracts
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                        {options.filter(o => o.isUnusual).map((f, i) => <OptionsCard key={f.id} f={f} i={i} tz={tz} />)}
                      </div>
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 14 }}>All Options Flow ({options.length})</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                      {options.map((f, i) => <OptionsCard key={f.id} f={f} i={i} tz={tz} />)}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* PINNED TRADES TAB */}
          {tab === 'pinned' && (
            <motion.div key="pinned" style={{ height: '100%', overflowY: 'auto', padding: '24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{
                padding: '16px 20px', borderRadius: 14, marginBottom: 24,
                background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 24 }}>📌</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#f0f4ff', marginBottom: 6, fontSize: 16 }}>Your Active Day Trades</p>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                    Track your live entry setups here. The engine provides dynamic exit warnings based on market closing hours so you safely exit Options positions without holding risk overnight.
                  </p>
                </div>
              </div>

              {pinned.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50%', gap: 10 }}>
                  <span style={{ fontSize: 44 }}>📌</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 600, fontSize: 15 }}>No pinned trades yet</p>
                  <p style={{ color: '#475569', fontSize: 13 }}>Click [PIN] on any scanning signal or past signal to track it here.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
                  <AnimatePresence>
                    {pinned.map((p) => {
                      const isCall = p.signal === 'BUY';
                      const color = isCall ? '#22c55e' : '#f43f5e';
                      
                      return (
                        <motion.div key={p.id}
                          layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                          style={{
                            background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column'
                          }}>
                          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <span style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff' }}>{p.ticker}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: p.assetType === 'OPTION' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.1)', color: p.assetType === 'OPTION' ? '#a5b4fc' : '#94a3b8' }}>{p.assetType || 'STOCK'}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44` }}>{p.signal}</span>
                              </div>
                              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                Entry Marker: <strong style={{ color: '#e2e8f0' }}>${p.price.toFixed(2)}</strong> {p.strikeLabel && `→ ${p.strikeLabel}`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, color: '#64748b' }}>Pinned on</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{p.date}</div>
                              <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.time}</div>
                            </div>
                          </div>

                          <div style={{ padding: '16px 20px', flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Strategy Tracked</div>
                            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                              <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>⚙️ {p.strategyName || 'Momentum Push'}</div>
                              {p.reason}
                            </div>
                            
                            <div style={{ marginTop: 16 }}>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Dynamic Exit Plan</div>
                              <div style={{
                                padding: '12px', borderRadius: 8,
                                background: p.exitDate ? 'rgba(244,63,94,0.1)' : 'rgba(34,197,94,0.08)',
                                border: `1px solid ${p.exitDate ? 'rgba(244,63,94,0.3)' : 'rgba(34,197,94,0.3)'}`,
                              }}>
                                {p.exitDate ? (
                                  <div style={{ display: 'flex', gap: 8, color: '#f43f5e', fontSize: 13, fontWeight: 600 }}>
                                    <span>⚠️</span> <span>Momentum Flipped! Sell triggered at {p.exitTime} on {p.exitDate}.</span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 8, color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
                                    <span>✅</span> <span>Safe to ride momentum. Sell Date: ---</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <button
                              onClick={() => {
                                const arr = pinned.filter(x => x.id !== p.id);
                                setPinned(arr);
                                localStorage.setItem('shoption_pinned', JSON.stringify(arr));
                                window.dispatchEvent(new Event('storage'));
                              }}
                              style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            >
                              <span>🗑️</span> <span style={{ marginTop: 2 }}>Close Trade & Discard File</span>
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── BOTTOM LEGEND ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: '8px 24px', background: '#0d1117', borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 11, color: '#334155', flexShrink: 0,
      }}>
        <span><span style={{ color: '#22c55e' }}>↑ BUY</span> = Upward momentum + high volume</span>
        <span><span style={{ color: '#f43f5e' }}>↓ SELL</span> = Breakdown + selling pressure</span>
        <span><span style={{ color: '#f59e0b' }}>● WATCH</span> = Unusual activity, monitor it</span>
        <span style={{ color: '#1e293b' }}>|</span>
        <span>Refreshes every 15s · Data from Polygon.io</span>
      </div>
    </div>
  );
}
