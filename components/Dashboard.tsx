'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AlertToast from './AlertToast';

// ── Types ─────────────────────────────────────────────────────
interface BacktestRow {
  id: string;
  ticker: string;
  signal: 'BUY' | 'SELL';
  entryTime: number;
  entryDate: string;
  entryPrice: number;
  peakPrice: number;
  peakPremium: number;
  entryPremium: number;
  maxGainPct: number;
  hitTarget: number;
  strength: number;
  reason: string;
}

interface AdvancedMetrics {
  stopLoss: number;
  takeProfit: number;
  winRate: number;
  rsi: number;
  macd: string;
  gex: string;
  darkPool: number;
  sectorRel: string;
  durationEst: string;
  riskGrade: 'A+'|'A'|'B'|'C'|'F';
  squeezeMeter: number;
  posSize: string;
  atr: number;
}

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
  signal: 'BUY' | 'SELL' | 'NONE'; // Eliminated WATCH
  signalStrength: number;
  reason: string;
  isAfterHours?: boolean;
  detectedAt?: string;
  assetType?: 'STOCK' | 'OPTION';
  strategyName?: string;
  strikeLabel?: string;
  proMetrics?: AdvancedMetrics;
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

const Sparkline = ({ color }: { color: string }) => {
  const pts = Array.from({ length: 14 }).map((_, i) => `${i * 10},${Math.random() * 20 + 5}`).join(' L ');
  return (
    <svg width="100%" height="28" viewBox="0 0 130 30" style={{ filter: `drop-shadow(0 0 4px ${color}88)`, marginTop: -10 }}>
      <path d={`M 0,25 L ${pts}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Glassmorphic 2000x Signal Card ──────────────────────────
function SignalCard({ r, isNew, onPin }: { r: ScanResult; isNew: boolean; onPin: (t: PinnedTrade) => void }) {
  const isBuy  = r.signal === 'BUY';
  const isSell = r.signal === 'SELL';
  if (!isBuy && !isSell) return null; // Only render execution signals

  const accentColor = isBuy ? '#22c55e' : '#f43f5e';
  const changeColor = r.change >= 0 ? '#22c55e' : '#f43f5e';
  const pm = r.proMetrics;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      style={{
        background: isBuy
          ? 'linear-gradient(160deg, rgba(34,197,94,0.06) 0%, rgba(5,5,15,0.95) 70%)'
          : 'linear-gradient(160deg, rgba(244,63,94,0.06) 0%, rgba(5,5,15,0.95) 70%)',
        border: `1px solid ${accentColor}33`,
        borderTop: `2px solid ${accentColor}`,
        borderRadius: 16,
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 8px 32px -12px ${accentColor}22`,
        animation: isNew ? `${isBuy ? 'flash-buy' : 'flash-sell'} 0.9s ease-out` : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 140, height: 140,
        borderRadius: '50%', background: `radial-gradient(circle, ${accentColor}18, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>{r.ticker}</span>
            {r.assetType && (
               <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: r.assetType === 'OPTION' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.08)', color: r.assetType === 'OPTION' ? '#a5b4fc' : '#94a3b8', border: '1px solid rgba(255,255,255,0.05)' }}>
                 {r.assetType}
               </span>
            )}
            {pm && (
               <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `rgba(255,255,255,0.1)`, color: pm.riskGrade.includes('A') ? '#22c55e': '#e2e8f0', border: '1px solid rgba(255,255,255,0.05)' }}>
                 GRADE {pm.riskGrade}
               </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            ${r.price.toFixed(2)}
            <span style={{ fontSize: 13, fontWeight: 600, color: changeColor }}>
              {fmt.pct(r.change)}
            </span>
          </div>
          {r.strikeLabel && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginTop: 4 }}>
              ↳ Target {r.strikeLabel}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                📌 PIN
              </button>
            <SignalBadge signal={r.signal} />
          </div>
          {pm && <div style={{ fontSize: 10, color: '#475569', fontWeight: 700 }}>EDGE: <span style={{color: '#94a3b8'}}>{pm.winRate}%</span></div>}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Sparkline color={accentColor} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
         {pm ? (
           <>
             {/* Micro-Data Grid */}
             <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)' }}>
               <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>STOP LOSS</div>
               <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e' }}>${pm.stopLoss.toFixed(2)}</div>
             </div>
             <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)', textAlign: 'right' }}>
               <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>TAKE PROFIT</div>
               <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>${pm.takeProfit.toFixed(2)}</div>
             </div>
             
             <div style={{ display: 'flex', justifyContent: 'space-between', gridColumn: '1 / -1', marginTop: 4 }}>
               <span style={{ fontSize: 10, color: '#64748b' }}>RSI: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.rsi}</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>MACD: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.macd}</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>D. POOL: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.darkPool}%</span></span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', gridColumn: '1 / -1' }}>
               <span style={{ fontSize: 10, color: '#64748b' }}>SECT: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.sectorRel}</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>SQZ: <span style={{color: pm.squeezeMeter > 80 ? '#f59e0b' : '#94a3b8', fontWeight: 600}}>{pm.squeezeMeter}%</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>ATR: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.atr}</span></span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', gridColumn: '1 / -1' }}>
               <span style={{ fontSize: 10, color: '#64748b' }}>SZ: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.posSize}</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>DUR: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.durationEst}</span></span>
               <span style={{ fontSize: 10, color: '#64748b' }}>GEX: <span style={{color: '#94a3b8', fontWeight: 600}}>{pm.gex}</span></span>
             </div>
           </>
         ) : (
           <div style={{ gridColumn: '1 / -1', fontSize: 10, color: '#64748b', textAlign: 'center' }}>Pro Metrics Loading...</div>
         )}
      </div>

      {r.reason && (
        <div style={{
          position: 'relative', zIndex: 1, marginTop: 12, fontSize: 11, color: '#cbd5e1', lineHeight: 1.4,
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          {r.strategyName && <span style={{ fontWeight: 800, color: '#f8fafc', marginRight: 6 }}>⚙️ {r.strategyName}</span>}
          {r.reason}
        </div>
      )}
    </motion.div>
  );
}

// ── Past Trade Card ────────────────────────────────────────────
function PastCard({ t, onPin, currentPrice, tz }: { t: PastTrade; onPin: (t: PinnedTrade) => void; currentPrice?: number; tz: string }) {
  const isBuy = t.signal === 'BUY';
  const color = isBuy ? '#22c55e' : '#f43f5e';
  
  // Real-time tz logic dynamically formatting timestamp
  const dynDate = new Date(t.timestamp).toLocaleString('en-US', { timeZone: tz, month: 'short', day: '2-digit' });
  const dynTime = new Date(t.timestamp).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short' });

  // Literal PNL Mapping (Reality)
  let pnlHtml = null;
  if (currentPrice && currentPrice !== t.price) {
    const diff = currentPrice - t.price;
    const pnl = isBuy ? diff : -diff;
    const pnlPct = (pnl / t.price) * 100;
    const pnlColor = pnl > 0 ? '#22c55e' : '#f43f5e';
    const isWin = pnl > 0;
    pnlHtml = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: pnlColor, background: `${pnlColor}15`, padding: '3px 8px', borderRadius: 6, border: `1px solid ${pnlColor}22` }}>
          {isWin ? '+' : ''}{pnlPct.toFixed(1)}% ({isWin ? '+' : '-'}${Math.abs(pnl).toFixed(2)})
        </span>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
          Live Open PNL
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: isBuy
          ? 'linear-gradient(160deg, rgba(34,197,94,0.06) 0%, rgba(5,5,15,0.95) 70%)'
          : 'linear-gradient(160deg, rgba(244,63,94,0.06) 0%, rgba(5,5,15,0.95) 70%)',
        border: `1px solid ${color}33`, borderTop: `2px solid ${color}`,
        borderRadius: 16, padding: '16px', position: 'relative', overflow: 'hidden',
        boxShadow: `0 8px 32px -12px ${color}22`
      }}
    >
      <div style={{ position: 'absolute', top: -50, right: -50, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${color}12, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>{t.ticker}</span>
            {t.assetType && (
               <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: t.assetType === 'OPTION' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.08)', color: t.assetType === 'OPTION' ? '#a5b4fc' : '#94a3b8', border: '1px solid rgba(255,255,255,0.05)' }}>
                 {t.assetType}
               </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            Entry: ${t.price.toFixed(2)}
          </div>
          {t.strikeLabel && <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginTop: 4 }}>↳ Target {t.strikeLabel}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <SignalBadge signal={t.signal} />
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{dynDate} · {dynTime}</div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <Sparkline color={color} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
         <div style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', flex: 1 }}>
            {t.reason}
         </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, justifyContent: 'space-between' }}>
        <button onClick={() => onPin({ ...t, pinnedAt: Date.now() })} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer' }}>
          📌 PIN
        </button>
        {pnlHtml}
      </div>
    </motion.div>
  );
}

// ── Options Flow Glassmorphic Card ──────────────────────────────
function OptionsCard({ f, i, tz, onPin }: { f: OptionsRow; i: number; tz: string; onPin: (t: PinnedTrade) => void }) {
  const isCall = f.type === 'call';
  const color  = isCall ? '#22c55e' : '#f43f5e';
  const dte    = fmt.dte(f.expiry);
  const timeStr = new Date(f.timestamp || Date.now()).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      style={{
        background: isCall
          ? 'linear-gradient(160deg, rgba(34,197,94,0.06) 0%, rgba(5,5,15,0.95) 70%)'
          : 'linear-gradient(160deg, rgba(244,63,94,0.06) 0%, rgba(5,5,15,0.95) 70%)',
        border: `1px solid ${color}33`, borderTop: `2px solid ${color}`,
        borderRadius: 16, padding: '16px', position: 'relative', overflow: 'hidden',
        boxShadow: `0 8px 32px -12px ${color}22`
      }}
    >
      <div style={{ position: 'absolute', top: -50, right: -50, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${color}12, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <span style={{ fontWeight: 800, fontSize: 24, color: '#f8fafc', letterSpacing: '-0.02em' }}>{f.ticker}</span>
           <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: isCall ? 'rgba(34,197,94,0.12)' : 'rgba(244,63,94,0.12)', color, border: `1px solid ${color}33` }}>
             {isCall ? '↑ BUY CALL' : '↓ BUY PUT'}
           </span>
        </div>
        <button onClick={() => onPin({ id: `${f.id}-${Date.now()}`, ticker: f.ticker, signal: isCall ? 'BUY' : 'SELL', price: f.premium, reason: 'Options flow institutional sweep', strength: 99, time: timeStr, date: new Date().toLocaleDateString(), timestamp: Date.now(), assetType: 'OPTION', strikeLabel: `$${f.strike} ${f.type.toUpperCase()}`, pinnedAt: Date.now() })} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}>
          📌 PIN
        </button>
      </div>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
         <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)' }}>
           <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>STRIKE</div>
           <div style={{ fontSize: 13, fontWeight: 700, color }}>${f.strike < 10 ? f.strike.toFixed(2) : f.strike.toFixed(0)}</div>
         </div>
         <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.03)', textAlign: 'right' }}>
           <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>EXPIRES</div>
           <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{f.expiry.slice(5)} <span style={{fontSize: 9, color:'#64748b'}}>({dte}d)</span></div>
         </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>VOLUME</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>{fmt.vol(f.volume)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>TIME</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{timeStr}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>VOL/OI EDGE</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: f.volumeOIRatio > 1 ? '#f59e0b' : '#94a3b8' }}>
            {f.volumeOIRatio.toFixed(1)}x
          </div>
        </div>
      </div>

      {f.isUnusual && (
        <div style={{ marginTop: 12, padding: '6px 0', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
          ⚡ INSTITUTIONAL ACTIVITY SWEEP
        </div>
      )}
    </motion.div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────
export default function Dashboard() {
  const [tab,       setTab]       = useState<'scanner'|'testing'>('scanner');
  const [filter,    setFilter]    = useState<'all'|'buy'|'sell'|'watch'>('all');
  const [results,   setResults]   = useState<ScanResult[]>([]);
  const [backtests, setBacktests] = useState<BacktestRow[]>([]);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [optLoading, setOptLoad]  = useState(true);
  const [scanning,  setScanning]  = useState(false);
  const [stats,     setStats]     = useState({ total: 0, buys: 0, sells: 0 });
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

  // Scanner fetch
  const fetchScan = useCallback(async () => {
    // Cut API drainage during offline hours entirely.
    if (mkt.label === 'Closed') {
      setLoading(false);
      setScanning(false);
      return;
    }
    
    setScanning(true);
    try {
      const r = await fetch('/api/scan');
      if (!r.ok) return;
      const d = await r.json();
      const data: ScanResult[] = d.results ?? [];
      
      setResults(prev => {
        // Create an active accumulation history without wiping on every re-render
        let newResults = [...prev];
        let stateUpdated = false;
        
        for (const item of data) {
           if (item.signal !== 'NONE') {
               // WebSocket emulation logging as requested
               console.log("Incoming Signal:", item);
               
               // Prevent exact duplicate overwrites (check ticker & signal type)
               const exists = newResults.find(r => r.ticker === item.ticker && r.signal === item.signal);
               if (!exists) {
                   newResults.unshift(item); // Prepend so newest is on top
                   stateUpdated = true;
               } else {
                   // Update live pricing but don't duplicate the entry
                   exists.price = item.price;
                   exists.change = item.change;
                   stateUpdated = true;
               }
           }
        }
        
        // Constrain array bloat
        if (newResults.length > 200) newResults = newResults.slice(0, 200);
        
        // Dynamically compute stats from the accumulated list
        const buys  = newResults.filter(r => r.signal === 'BUY').length;
        const sells = newResults.filter(r => r.signal === 'SELL').length;
        setStats({ total: newResults.length, buys, sells });
        
        return stateUpdated ? newResults : prev;
      });

      setLastScan(new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }));
    } catch (e) { console.error('[scan]', e); }
    finally { setScanning(false); setLoading(false); }
  }, [tz, mkt.label]);

  const fetchBacktests = useCallback(async () => {
    try {
      const r = await fetch('/api/backtests');
      if (!r.ok) return;
      const d = await r.json();
      setBacktests(d.backtests || []);
    } catch (e) { console.error('[backtests]', e); }
  }, []);

  const runHistoricalSimulation = async () => {
    setRunningBacktest(true);
    try {
      const r = await fetch('/api/run-backtest', { method: 'POST' });
      await r.json();
      await fetchBacktests();
    } catch (e) { console.error(e); }
    finally { setRunningBacktest(false); }
  };

  useEffect(() => { fetchBacktests(); }, [fetchBacktests]);

  useEffect(() => { fetchScan(); const id = setInterval(fetchScan, 180000); return () => clearInterval(id); }, [fetchScan]);
  // Orevix exclusively targets verified volume breaks, no legacy options tape needed

  const filtered = results.filter(r => {
    if (r.signal === 'NONE') return false;
    if (filter === 'buy' && r.signal !== 'BUY') return false;
    if (filter === 'sell' && r.signal !== 'SELL') return false;
    // Architecture Pivot: Enforce strictly Options metrics over the live scanner view
    if (r.assetType !== 'OPTION') return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#000000' }}>
      <AlertToast />

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px',
        background: '#000000', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#ffffff', color: '#000000', fontWeight: 900, fontSize: 18,
          }}>X</div>
          <div>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', letterSpacing: '0.05em' }}>OREVIX</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Terminal</span>
          </div>
        </div>

        {/* Market pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, background: mkt.bg, border: `1px solid ${mkt.color}44` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: mkt.color, boxShadow: `0 0 8px ${mkt.color}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: mkt.color }}>{mkt.label}</span>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: '🔥 BUY', value: stats.buys,  color: '#22c55e' },
            { label: '🩸 SELL', value: stats.sells, color: '#f43f5e' },
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
        </div>

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
        background: '#000000', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        {([
          { id: 'scanner', icon: '📡', label: 'Live Signals',  badge: stats.buys + stats.sells },
          { id: 'testing', icon: '🧪', label: 'Testing Strategy', badge: 0 },
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

            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all',  label: `All (${filtered.length})` },
                { id: 'buy',  label: `Buy (${stats.buys})` },
                { id: 'sell', label: `Sell (${stats.sells})` },
              ].map(({ id, label }) => {
                const isActive = filter === id;
                const chipColor = id === 'buy' ? '#22c55e' : id === 'sell' ? '#f43f5e' : '#f0f4ff';
                return (
                  <button key={id} onClick={() => setFilter(id as any)} style={{
                    padding: '6px 14px', borderRadius: 100, border: `1px solid ${isActive ? chipColor + '55' : 'rgba(255,255,255,0.08)'}`,
                    background: isActive ? `${chipColor}15` : 'transparent',
                    color: isActive ? chipColor : '#475569',
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
              ) : mkt.label === 'Closed' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 48 }}>🌙</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 18 }}>Scanner Paused &mdash; Market Offline</p>
                  <p style={{ color: '#64748b', fontSize: 14, maxWidth: 300, lineHeight: 1.5 }}>
                    The advanced processing engine has safely powered down. Standard real-time analytics will resume precisely at 9:30 AM EST to prevent faulty API mapping.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 48 }}>📊</span>
                  <p style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 16 }}>
                    {filter !== 'all' ? `No ${filter.toUpperCase()} signals right now` : 'Scanning for Institutional Flow...'}
                  </p>
                  <p style={{ color: '#475569', fontSize: 13 }}>
                    The engine is parsing depth. Best alerts trigger during peak momentum hours.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {filtered.map(r => <SignalCard key={r.ticker} r={r} isNew={newTickers.has(r.ticker)} onPin={() => {}} />)}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* TESTING STRATEGY TAB */}
          {tab === 'testing' && (
            <motion.div key="testing" style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{
                padding: '14px 18px', borderRadius: 14, marginBottom: 20,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🧪</span>
                  <div>
                    <p style={{ fontWeight: 700, color: '#f0f4ff', marginBottom: 4, fontSize: 14 }}>Historical Options Backtester</p>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                      This engine sweeps trailing historical intraday data (1m arrays) and mathematically filters it through the live Scanner quantitative logic.<br/>
                      It targets identifying explosive setups mapping to an explicit <strong>≥10%</strong> simulated option premium target.
                    </p>
                  </div>
                </div>
                <button
                  onClick={runHistoricalSimulation}
                  disabled={runningBacktest}
                  style={{
                    padding: '8px 16px', borderRadius: 6, background: '#22c55e', color: '#000',
                    border: 'none', fontWeight: 800, fontSize: 13, cursor: runningBacktest ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flexShrink: 0
                  }}
                >
                  {runningBacktest ? 'Running Backtest...' : 'Run Historical Simulation'}
                </button>
              </div>

              {backtests.length === 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40%', gap: 10 }}>
                   <p style={{ color: '#475569', fontSize: 13 }}>No historical backtests stored in SQLite yet.</p>
                 </div>
              ) : (
                <div style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', color: '#94a3b8', textTransform: 'uppercase' }}>
                        <th style={{ padding: '12px 16px' }}>Date</th>
                        <th style={{ padding: '12px 16px' }}>Signal</th>
                        <th style={{ padding: '12px 16px' }}>Entry Premium</th>
                        <th style={{ padding: '12px 16px' }}>Peak Premium</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Max Gain</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtests.map((b) => (
                        <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{b.entryDate}</div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>{new Date(b.entryTime).toLocaleTimeString()}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: '#f0f4ff', fontWeight: 800, marginRight: 8 }}>{b.ticker}</span>
                            <span style={{ color: b.signal === 'BUY' ? '#4ade80' : '#f87171', fontWeight: 600 }}>{b.signal}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>${b.entryPremium.toFixed(2)}</td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>${b.peakPremium.toFixed(2)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: b.maxGainPct >= 10 ? '#4ade80' : '#fca5a5' }}>
                            +{b.maxGainPct.toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {b.hitTarget ? (
                              <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '4px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>HIT</span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 10 }}>MISS</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── BOTTOM LEGEND ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: '8px 24px', background: '#000000', borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 11, color: '#334155', flexShrink: 0,
      }}>
        <span><span style={{ color: '#22c55e' }}>↑ BUY</span> = Validated Breakout Setup</span>
        <span><span style={{ color: '#f43f5e' }}>↓ SELL</span> = Validated Breakdown Setup</span>
        <span style={{ color: '#1e293b' }}>|</span>
        <span>Refreshes strictly per Polygon.io institutional streams.</span>
      </div>
    </div>
  );
}
