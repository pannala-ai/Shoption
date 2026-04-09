import { motion } from 'framer-motion';
import { ScanResult, PinnedTrade } from './types';
import { Activity, Target, ShieldAlert, Cpu, Zap, BarChart2 } from 'lucide-react';

interface SignalCardProps {
  r: ScanResult;
  isNew: boolean;
  onPin: (t: PinnedTrade) => void;
  tz: string;
}

// Helper to format values
const fmt = {
  usd: (n: number) => `$${n.toFixed(2)}`,
  pct: (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%'
};

export default function SignalCard({ r, isNew, onPin, tz }: SignalCardProps) {
  const isActionable = r.signal === 'BUY' || r.signal === 'SELL';
  if (!isActionable) return null;

  const pm = r.proMetrics;
  
  // XAI Architecture
  const rawFeatures = r.reason.split(' — ');
  const mainStrategy = rawFeatures[0] || r.strategyName || 'Algorithmic Anomaly';
  const naturalLanguageSummary = rawFeatures[1] || 'Quantitative model detected significant structural edge triggering this alert.';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className="glass"
      style={{
        borderRadius: 12, 
        padding: 24,
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${isNew ? 'var(--accent)' : 'var(--border)'}`
      }}
    >
      {/* Action Indicator */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: r.signal === 'BUY' ? 'var(--buy)' : 'var(--sell)' }} />

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {r.ticker}
            </h3>
            <span style={{ 
              background: 'var(--accent-soft)', 
              color: 'var(--accent)', 
              padding: '2px 8px', 
              borderRadius: 4, 
              fontSize: 10, 
              fontWeight: 700 
            }}>
              OPTION
            </span>
            {r.detectedAt && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                DETECTED {new Date(r.detectedAt).toLocaleTimeString('en-US', { 
                  timeZone: tz, 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  hour12: true 
                })}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{fmt.usd(r.price)}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>{fmt.pct(r.change)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 6, 
            background: r.signal === 'BUY' ? 'var(--buy-soft)' : 'var(--sell-soft)', 
            color: r.signal === 'BUY' ? 'var(--buy)' : 'var(--sell)', 
            padding: '4px 12px', 
            borderRadius: 100, 
            fontSize: 12, 
            fontWeight: 700 
          }}>
            <Zap size={14} />
            {r.signal === 'BUY' ? 'EXECUTE LONG' : 'EXECUTE SHORT'}
          </div>
          
          <button 
            onClick={() => onPin({
              id: `${r.ticker}-${Date.now()}`, ticker: r.ticker, signal: r.signal as 'BUY'|'SELL',
              price: r.price, reason: r.reason, strength: r.signalStrength,
              time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(),
              timestamp: Date.now(), assetType: r.assetType, strategyName: r.strategyName, strikeLabel: r.strikeLabel,
              pinnedAt: Date.now()
            })}
            style={{
              background: 'var(--bg-card2)', 
              border: '1px solid var(--border)', 
              color: 'var(--text-secondary)',
              padding: '6px 16px', 
              borderRadius: 8, 
              fontSize: 11, 
              fontWeight: 700, 
              letterSpacing: '0.04em',
              cursor: 'pointer', 
              transition: 'all 0.3s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--border-soft)'; }}
            onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-card2)'; }}
          >
            PIN TRADE
          </button>
        </div>
      </div>

      {/* CONFIDENCE SCORE GAUGE */}
      <div style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={14} color="var(--accent)" />
            AI Confidence Score
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{r.signalStrength}% Probability</span>
        </div>
        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
           <motion.div 
             initial={{ width: 0 }}
             animate={{ width: `${r.signalStrength}%` }}
             transition={{ duration: 1, ease: "easeOut" }}
             style={{ height: '100%', background: 'var(--accent-grad)', borderRadius: 3 }}
           />
        </div>
      </div>

      {r.strikeLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
          <Target size={16} color="var(--watch)" /> Target {r.strikeLabel}
        </div>
      )}

      {/* FEATURE IMPORTANCE XAI BULLETS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {pm && (
          <>
            <div style={{ background: 'var(--bg-card2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
               <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>RSI Momentum</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>{pm.rsi} / 100</div>
            </div>
            <div style={{ background: 'var(--bg-card2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
               <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>GEX Regime</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>{r.gexRegime || 'NORMAL'}</div>
            </div>
            <div style={{ background: 'var(--bg-card2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
               <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Stop Loss</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>${pm.stopLoss.toFixed(2)}</div>
            </div>
             <div style={{ background: 'var(--bg-card2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
               <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Take Profit</div>
               <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>${pm.takeProfit.toFixed(2)}</div>
            </div>
          </>
        )}
      </div>

      {/* NATURAL LANGUAGE SETUP SUMMARY */}
      <div style={{ 
        background: 'var(--bg-card2)', 
        borderLeft: '4px solid var(--accent)', 
        padding: '12px 14px', 
        borderRadius: '0 6px 6px 0',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--text-secondary)'
      }}>
        <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>{mainStrategy}</strong>
        {naturalLanguageSummary}
      </div>

    </motion.div>
  );
}
