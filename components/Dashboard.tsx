'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AlertToast from './AlertToast';
import SignalCard from './SignalCard';
import AssistantInput from './AssistantInput';
import { BacktestRow, AdvancedMetrics, ScanResult, OptionsRow, PastTrade, PinnedTrade } from './types';

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
  if (mins >= 570 && mins < 960)  return { label: 'Open',       color: '#2081F9', bg: 'rgba(32, 129, 249, 0.12)' };
  if (mins >= 240 && mins < 570)  return { label: 'Pre-Market', color: '#F99820', bg: 'rgba(249, 152, 32, 0.12)' };
  if (mins >= 960 && mins < 1200) return { label: 'After Hours',color: '#F99820', bg: 'rgba(249, 152, 32, 0.12)' };
  return { label: 'Closed', color: '#475569', bg: 'rgba(71, 85, 105, 0.12)' };
}

// ── Past Trade Card ────────────────────────────────────────────
function PastCard({ t, onPin, currentPrice, tz }: { t: PastTrade; onPin: (t: PinnedTrade) => void; currentPrice?: number; tz: string }) {
  const isBuy = t.signal === 'BUY';
  const color = 'var(--accent)';
  
  const entryMs = t.entryTime || t.timestamp;
  const exitMs = t.exitTime || (t.timestamp + 3600000); // fallback to 1hr later

  const entryDate = new Date(entryMs).toLocaleString('en-US', { timeZone: tz, month: 'short', day: '2-digit' });
  const entryTimeStr = new Date(entryMs).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  
  const exitDate = new Date(exitMs).toLocaleString('en-US', { timeZone: tz, month: 'short', day: '2-digit' });
  const exitTimeStr = new Date(exitMs).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass"
      style={{
        borderRadius: 12, padding: '24px', position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{t.ticker}</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            Entry: {t.entryPrice ? `$${t.entryPrice.toFixed(2)}` : (t.price ? `$${t.price.toFixed(2)}` : 'N/A')}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 100, background: isBuy ? 'var(--buy-soft)' : 'var(--sell-soft)', color: isBuy ? 'var(--buy)' : 'var(--sell)' }}>
            {isBuy ? '↑ LONG' : '↓ SHORT'}
          </span>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, marginTop: 4, textAlign: 'right' }}>
            <div style={{color: 'var(--text-muted)', fontSize: 10}}>BOUGHT</div>
            {entryDate} {entryTimeStr}
          </div>
        </div>
      </div>
      
      <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
           {t.maxGainPct !== undefined && <div style={{ fontSize: 16, fontWeight: 800, color: t.maxGainPct > 0 ? 'var(--buy)' : 'var(--sell)' }}>{t.maxGainPct > 0 ? '+' : ''}{t.maxGainPct}% PNL</div>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'right' }}>
          <div style={{color: 'var(--text-muted)', fontSize: 10}}>SOLD</div>
          {exitDate} {exitTimeStr}
        </div>
      </div>
    </motion.div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────
export default function Dashboard() {
  const [tab,       setTab]       = useState<'scanner'|'earnings'|'testing'|'past'>('scanner');
  const [filter,    setFilter]    = useState<'all'|'buy'|'sell'|'watch'>('all');
  const [results,   setResults]   = useState<ScanResult[]>([]);
  const [backtests, setBacktests] = useState<any[]>([]);
  const [pastSignals, setPastSignals] = useState<any[]>([]);
  const [pinnedTrades, setPinnedTrades] = useState<PinnedTrade[]>([]);
  const [earningsSignals, setEarningsSignals] = useState<any[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [hasRunBacktest, setHasRunBacktest] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [pastLoading, setPastLoading] = useState(true);
  const [scanning,  setScanning]  = useState(false);
  const [stats,     setStats]     = useState({ total: 0, buys: 0, sells: 0 });
  const [lastScan,  setLastScan]  = useState('');
  const [time,      setTime]      = useState('');
  const [mkt,       setMkt]       = useState(marketStatus());
  const [newTickers, setNewTick]  = useState<Set<string>>(new Set());
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
    setScanning(true);
    try {
      const r = await fetch('/api/scan');
      if (!r.ok) return;
      const d = await r.json();
      const data: ScanResult[] = d.results ?? [];
      
      setResults(prev => {
        let newResults = [...prev];
        let stateUpdated = false;
        
        for (const item of data) {
           if (item.signal !== 'NONE') {
               const exists = newResults.find(r => r.ticker === item.ticker && r.signal === item.signal);
               if (!exists) {
                   newResults.unshift(item);
                   stateUpdated = true;
               } else {
                   exists.price = item.price;
                   exists.change = item.change;
                   stateUpdated = true;
               }
           }
        }
        
        if (newResults.length > 200) newResults = newResults.slice(0, 200);
        
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

  const fetchPastSignals = useCallback(async () => {
    setPastLoading(true);
    try {
      const r = await fetch('/api/past-signals');
      if (!r.ok) return;
      const d = await r.json();
      setPastSignals(d.signals || []);
    } catch (e) { console.error('[past-signals]', e); }
    finally { setPastLoading(false); }
  }, []);

  const fetchEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const r = await fetch('/api/earnings-scanner');
      if (!r.ok) return;
      const d = await r.json();
      setEarningsSignals(d.signals || []);
    } catch (e) { console.error('[earnings-scanner]', e); }
    finally { setEarningsLoading(false); }
  }, []);

  const runHistoricalSimulation = async () => {
    setRunningBacktest(true);
    setHasRunBacktest(false);
    try {
      const r = await fetch('/api/run-backtest', { method: 'POST' });
      await r.json();
      await fetchBacktests();
    } catch (e) { 
      console.error(e); 
    } finally { 
      setRunningBacktest(false); 
      setHasRunBacktest(true);
    }
  };

  useEffect(() => { 
    fetchBacktests(); 
    fetchPastSignals();
    fetchEarnings();
  }, [fetchBacktests, fetchPastSignals, fetchEarnings]);

  useEffect(() => { fetchScan(); const id = setInterval(fetchScan, 180000); return () => clearInterval(id); }, [fetchScan]);

  const filtered = results.filter(r => {
    if (r.signal === 'NONE') return false;
    if (filter === 'buy' && r.signal !== 'BUY') return false;
    if (filter === 'sell' && r.signal !== 'SELL') return false;
    if (r.assetType !== 'OPTION') return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <AlertToast />

      {/* ── HEADER / F-PATTERN SUMMARY ── */}
      <div className="glass" style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
        boxShadow: '0 4px 12px rgba(0,0,0,0.02)', zIndex: 10, position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--text-primary)', color: 'var(--bg-base)', fontWeight: 900, fontSize: 16,
          }}>O</div>
          <div>
            <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>OREVIX AI</span>
          </div>
        </div>

        {/* Market pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 100, background: mkt.bg, border: `1px solid ${mkt.color}44` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: mkt.color, boxShadow: `0 0 8px ${mkt.color}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: mkt.color }}>{mkt.label}</span>
        </div>

        {/* Quick stats (No red/green - just Trust Blue) */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Long Scans', value: stats.buys },
            { label: 'Short Scans', value: stats.sells },
          ].map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-card2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 12px',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
        </div>

        <div style={{ flex: 1 }} />
        {scanning && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>⟳ Parsing Data...</span>}
        <select 
          value={tz} 
          onChange={(e) => setTz(e.target.value)}
          style={{ 
            background: 'var(--bg-card2)', color: 'var(--text-primary)', 
            border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer'
          }}
        >
          <option value="America/New_York">EST</option>
          <option value="America/Los_Angeles">PST</option>
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>{time}</span>
      </div>

      {/* ── ASSISTANT INPUT BAR ── */}
      <div style={{ padding: '24px 24px 0 24px', zIndex: 5, position: 'relative' }}>
         <AssistantInput />
      </div>

      {/* ── TAB BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '24px 24px 16px 24px',
        flexShrink: 0,
      }}>
        {([
          { id: 'scanner',  label: 'Executable Signals',   badge: stats.buys + stats.sells },
          { id: 'earnings', label: 'Volatility Edge',  badge: earningsSignals.filter((s: any) => s.verdict !== 'FAIR').length },
          { id: 'testing',  label: 'Backtester',     badge: 0 },
          { id: 'past',     label: 'Past Signals',   badge: pastSignals.length },
        ] as { id: typeof tab; label: string; badge: number }[]).map(({ id, label, badge }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} className={active ? "glass" : ""} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              borderRadius: 6, border: '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              background: active ? 'var(--bg-card)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: active ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
              borderColor: active ? 'var(--border)' : 'transparent',
            }}>
              <span>{label}</span>
              {badge > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700,
                  background: active ? 'var(--text-primary)' : 'var(--border-soft)',
                  color: active ? 'var(--bg-base)' : 'var(--text-secondary)',
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">

          {/* SCANNER TAB */}
          {tab === 'scanner' && (
            <motion.div key="scanner" style={{ height: '100%', overflowY: 'auto', padding: '0 24px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="glass" style={{ height: 220, borderRadius: 12 }} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16, textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}>
                    No Extracted Edge
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                    Orevix AI has not found any setups matching rigorous quantitative parameters.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {filtered.map(r => <SignalCard key={r.ticker + r.signal} r={r} isNew={newTickers.has(r.ticker)} onPin={() => {}} />)}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* EARNINGS EDGE TAB */}
          {tab === 'earnings' && (
            <motion.div key="earnings" style={{ height: '100%', overflowY: 'auto', padding: '0 24px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {earningsSignals.map((s: any, i: number) => {
                    const isRich  = s.verdict === 'IV_RICH';
                    const isCheap = s.verdict === 'IV_CHEAP';
                    return (
                      <div key={s.id}
                        className="glass"
                        style={{
                          borderRadius: 12, padding: 24, position: 'relative', overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.ticker}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{s.earningsSeason} · ~{s.dteApprox}DTE</div>
                          </div>
                          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: 'var(--accent)', color: '#fff' }}>
                              {isRich ? 'SELL VOLATILITY' : isCheap ? 'BUY VOLATILITY' : 'NO EDGE'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            </motion.div>
          )}

          {/* BACKTESTER TAB */}
          {tab === 'testing' && (
            <motion.div key="testing" style={{ height: '100%', overflowY: 'auto', padding: '0 24px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div className="glass" style={{
                padding: '24px', borderRadius: 12, marginBottom: 24,
                display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div>
                  <p style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, fontSize: 18 }}>Quantitative Historical Engine</p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Backtest the current Orevix algorithmic parameters against trailing aggregate flow data.
                  </p>
                </div>
                <button
                  onClick={runHistoricalSimulation}
                  disabled={runningBacktest}
                  style={{
                    padding: '14px 28px', borderRadius: 8, 
                    background: 'var(--accent)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', cursor: runningBacktest ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.3s ease', opacity: runningBacktest ? 0.6 : 1,
                    boxShadow: '0 8px 24px rgba(0, 122, 255, 0.4)',
                  }}
                  onMouseOver={e => { if (!runningBacktest) { e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                  onMouseOut={e => { if (!runningBacktest) { e.currentTarget.style.transform = 'translateY(0)'; } }}
                >
                  {runningBacktest ? 'RUNNING...' : 'EXECUTE SIMULATION'}
                </button>
              </div>

               <div className="glass" style={{
                  borderRadius: 12, overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11 }}>
                        <th style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>Setup</th>
                        <th style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>Entry Time</th>
                        <th style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>Entry</th>
                        <th style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Simulated PNL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtests.map((b) => (
                        <tr key={b.id} style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 600 }}>{b.entryDate}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 800 }}>{b.ticker} {b.signal === 'BUY' ? '↑' : '↓'}</td>
                          <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>{new Date(b.entryTime).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '14px 20px' }}>${b.entryPremium.toFixed(2)}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, color: b.maxGainPct > 0 ? 'var(--buy)' : 'var(--text-primary)' }}>
                            {b.maxGainPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </motion.div>
          )}

          {/* PAST SIGNALS TAB */}
          {tab === 'past' && (
            <motion.div key="past" style={{ height: '100%', overflowY: 'auto', padding: '0 24px 24px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                   {pastSignals.map((s: any) => (
                     <PastCard key={s.id} t={s} onPin={() => {}} tz={tz} />
                   ))}
                 </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
