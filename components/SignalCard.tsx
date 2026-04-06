import { motion } from 'framer-motion';
import { ScanResult, PinnedTrade } from './types';
import { Activity, Target, ShieldAlert, Cpu, Zap, BarChart2 } from 'lucide-react';

interface SignalCardProps {
  r: ScanResult;
  isNew: boolean;
  onPin: (t: PinnedTrade) => void;
}

// Helper to format values
const fmt = {
  usd: (n: number) => `$${n.toFixed(2)}`,
  pct: (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%'
};

export default function SignalCard({ r, isNew, onPin }: SignalCardProps) {
  const isActionable = r.signal === 'BUY' || r.signal === 'SELL';
  if (!isActionable) return null;

  const pm = r.proMetrics;
  
  // XAI Architecture - The "Black Box" is unacceptable
  // Parse the reason string into feature importance
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
      style={{
        background: '#1A365D', // Lighter navy card
        border: `1px solid ${isNew ? '#604CC3' : 'rgba(255, 255, 255, 0.15)'}`,
        borderRadius: 24, // heavily rounded corners
        padding: 24,
        color: '#E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: isNew ? '0 0 20px rgba(96, 76, 195, 0.15)' : 'none',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Action Indicator */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#F99820' }} />

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
              {r.ticker}
            </h3>
            <span style={{ 
              background: 'rgba(32, 129, 249, 0.1)', // Trust Blue bg
              color: '#2081F9', 
              padding: '2px 8px', 
              borderRadius: 4, 
              fontSize: 10, 
              fontWeight: 700 
            }}>
              OPTION
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{fmt.usd(r.price)}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>{fmt.pct(r.change)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 6, 
            background: 'rgba(249, 152, 32, 0.15)', // Action Orange
            color: '#F99820', 
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
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              color: '#CBD5E1',
              backdropFilter: 'blur(12px)',
              padding: '6px 16px', 
              borderRadius: 8, 
              fontSize: 11, 
              fontWeight: 700, 
              letterSpacing: '0.04em',
              cursor: 'pointer', 
              transition: 'all 0.3s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseOut={e => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
          >
            PIN TRADE
          </button>
        </div>
      </div>

      {/* CONFIDENCE SCORE GAUGE */}
      <div style={{ background: 'rgba(0, 0, 0, 0.2)', borderRadius: 12, padding: 16, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cpu size={14} color="#604CC3" />
            AI Confidence Score
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{r.signalStrength}% Probability</span>
        </div>
        <div style={{ width: '100%', height: 6, background: '#142E4A', borderRadius: 3, overflow: 'hidden' }}>
           <motion.div 
             initial={{ width: 0 }}
             animate={{ width: `${r.signalStrength}%` }}
             transition={{ duration: 1, ease: "easeOut" }}
             style={{ height: '100%', background: 'linear-gradient(90deg, #2081F9 0%, #604CC3 100%)', borderRadius: 3 }}
           />
        </div>
      </div>

      {r.strikeLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>
          <Target size={16} color="#F99820" /> Target {r.strikeLabel}
        </div>
      )}

      {/* FEATURE IMPORTANCE XAI BULLETS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {pm && (
          <>
            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
               <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>RSI Momentum</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>{pm.rsi} / 100</div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
               <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>GEX Regime</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>{r.gexRegime || 'NORMAL'}</div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
               <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>Stop Loss</div>
               <div style={{ fontSize: 13, fontWeight: 600 }}>${pm.stopLoss.toFixed(2)}</div>
            </div>
             <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
               <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>Take Profit</div>
               <div style={{ fontSize: 13, fontWeight: 600, color: '#2081F9' }}>${pm.takeProfit.toFixed(2)}</div>
            </div>
          </>
        )}
      </div>

      {/* NATURAL LANGUAGE SETUP SUMMARY */}
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.05)', 
        borderLeft: '4px solid #604CC3', 
        padding: '12px 14px', 
        borderRadius: '0 6px 6px 0',
        fontSize: 13,
        lineHeight: 1.5,
        color: '#CBD5E1'
      }}>
        <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>{mainStrategy}</strong>
        {naturalLanguageSummary}
      </div>

    </motion.div>
  );
}
