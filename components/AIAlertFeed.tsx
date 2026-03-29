'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Alert {
  id: string;
  ticker: string;
  thesis: {
    ticker?: string;
    setup?: string;
    thesis?: string;
    entry?: string;
    target?: string;
    stop?: string;
    confidence?: string;
    risk_reward?: string;
    timeframe?: string;
  };
  payload?: {
    price?: number;
    vwap?: number;
    rvol?: number;
  };
  timestamp: number;
}

interface AIAlertFeedProps {
  ticker: string;
}

// Demo watchlist to cycle through for AI analysis
const SCAN_LIST = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'MSFT', 'META', 'PLTR', 'MSTR', 'COIN', 'SMCI'];

export default function AIAlertFeed({ ticker }: AIAlertFeedProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanIdx, setScanIdx] = useState(0);
  const [status, setStatus] = useState('IDLE');
  const alertCount = useRef(0);

  const fetchAlert = useCallback(async (sym: string) => {
    setScanning(true);
    setStatus(`SCANNING ${sym}...`);
    try {
      const res = await fetch(`/api/alerts?ticker=${sym}`);
      const data = await res.json();
      if (data.triggered && data.thesis && !data.thesis.error) {
        const newAlert: Alert = {
          id: `${sym}-${Date.now()}-${++alertCount.current}`,
          ticker: sym,
          thesis: data.thesis,
          payload: data.payload,
          timestamp: data.timestamp,
        };
        setAlerts((prev) => [newAlert, ...prev].slice(0, 20));
        setStatus(`ALERT: ${sym}`);
      } else {
        setStatus(`NO SIGNAL: ${sym} (RVOL ${data.payload?.rvol?.toFixed(1) ?? '--'}x)`);
      }
    } catch {
      setStatus('API ERROR — retrying...');
    } finally {
      setScanning(false);
    }
  }, []);

  // Auto-scan ticker prop when it changes
  useEffect(() => {
    if (ticker) fetchAlert(ticker);
  }, [ticker, fetchAlert]);

  // Background scanner cycling through watchlist
  useEffect(() => {
    const interval = setInterval(() => {
      setScanIdx((i) => {
        const next = (i + 1) % SCAN_LIST.length;
        fetchAlert(SCAN_LIST[next]);
        return next;
      });
    }, 45000); // every 45 seconds
    return () => clearInterval(interval);
  }, [fetchAlert]);

  const confidenceColor = (c?: string) => {
    if (c === 'HIGH')   return '#00ff00';
    if (c === 'MEDIUM') return '#ffd700';
    return '#52525b';
  };

  const setupColor = (setup?: string) => {
    if (!setup) return '#71717a';
    if (setup.includes('Bullish') || setup.includes('Momentum') || setup.includes('Squeeze')) return '#00ff00';
    if (setup.includes('Bearish')) return '#ff3333';
    return '#ffd700';
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between', background: '#060606' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: scanning ? '#ffd700' : alerts.length > 0 ? '#00ff00' : '#52525b',
              boxShadow: scanning ? '0 0 6px #ffd700' : 'none',
              animation: scanning ? 'pulse 0.8s ease-in-out infinite' : 'none',
            }}
          />
          <span>AI ALERT FEED</span>
          {scanning && <span className="text-[9px] text-yellow-500 mono">{status}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-zinc-700 mono">{alerts.length} ALERTS</span>
          <button
            onClick={() => fetchAlert(ticker)}
            className="px-2 py-0.5 rounded text-[9px] mono font-semibold transition-all"
            style={{
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.25)',
              color: '#00d4ff',
              cursor: 'pointer',
            }}
          >
            SCAN NOW
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <AnimatePresence initial={false}>
          {alerts.length === 0 && !scanning ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
              <div className="text-4xl opacity-20">⚡</div>
              <p className="text-[10px] mono uppercase tracking-widest">Scanning for high-conviction setups...</p>
              <p className="text-[9px] mono text-zinc-800">RVOL {'>'} 3.0 · VWAP CROSS · OTM FLOW SPIKE</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const isBull = !alert.thesis.setup?.includes('Bear');
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: -16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className={`alert-card ${isBull ? '' : 'bear'}`}
                >
                  {/* Top Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="mono font-bold text-sm text-white">{alert.ticker}</span>
                      <span
                        className="text-[9px] font-bold mono"
                        style={{ color: setupColor(alert.thesis.setup) }}
                      >
                        {alert.thesis.setup ?? 'SIGNAL'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="badge"
                        style={{
                          background: `rgba(${confidenceColor(alert.thesis.confidence) === '#00ff00' ? '0,255,0' : confidenceColor(alert.thesis.confidence) === '#ffd700' ? '255,215,0' : '82,82,90'},0.1)`,
                          color: confidenceColor(alert.thesis.confidence),
                          border: `1px solid ${confidenceColor(alert.thesis.confidence)}40`,
                        }}
                      >
                        {alert.thesis.confidence ?? '?'}
                      </span>
                      <span className="text-[9px] mono text-zinc-700">
                        {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' })} ET
                      </span>
                    </div>
                  </div>

                  {/* Thesis */}
                  {alert.thesis.thesis && (
                    <p className="text-[10px] text-zinc-300 leading-relaxed mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {alert.thesis.thesis}
                    </p>
                  )}

                  {/* Trade Levels */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'ENTRY', value: alert.thesis.entry, color: '#71717a' },
                      { label: 'TARGET', value: alert.thesis.target, color: '#00ff00' },
                      { label: 'STOP', value: alert.thesis.stop, color: '#ff3333' },
                      { label: 'R/R', value: alert.thesis.risk_reward, color: '#ffd700' },
                    ].map(({ label, value, color }) => (
                      value ? (
                        <div key={label} className="text-center p-1 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #27272a' }}>
                          <div className="text-[8px] text-zinc-700 mono mb-0.5">{label}</div>
                          <div className="text-[10px] mono font-semibold" style={{ color }}>{value}</div>
                        </div>
                      ) : null
                    ))}
                  </div>

                  {/* Payload stats */}
                  {alert.payload && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[9px] mono text-zinc-700">
                        RVOL <span className="text-zinc-400">{alert.payload.rvol?.toFixed(1) ?? '--'}x</span>
                      </span>
                      <span className="text-[9px] mono text-zinc-700">
                        VWAP <span className="text-zinc-400">${alert.payload.vwap?.toFixed(2) ?? '--'}</span>
                      </span>
                      <span className="text-[9px] mono text-zinc-700">
                        {alert.thesis.timeframe ?? ''}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
