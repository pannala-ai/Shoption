'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AlertData {
  id: string;
  ticker: string;
  signal: 'BUY' | 'SELL';
  thesis?: {
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

const SCAN_LIST = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'MSFT', 'META', 'PLTR', 'MSTR', 'COIN', 'SMCI', 'ARM', 'AMZN', 'GOOGL', 'AVGO', 'NFLX'];

export default function AlertToast() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [scanning, setScanning] = useState(false);
  const scanIdx = useRef(0);
  const alertId = useRef(0);

  const fetchAlert = useCallback(async (sym: string) => {
    setScanning(true);
    try {
      const res = await fetch(`/api/alerts?ticker=${sym}`);
      const data = await res.json();
      if (data.triggered && data.thesis && !data.thesis.error) {
        const isBull = !data.thesis.setup?.includes('Bear');
        const newAlert: AlertData = {
          id: `${sym}-${Date.now()}-${++alertId.current}`,
          ticker: sym,
          signal: isBull ? 'BUY' : 'SELL',
          thesis: data.thesis,
          payload: data.payload,
          timestamp: data.timestamp ?? Date.now(),
        };
        setAlerts((prev) => [newAlert, ...prev].slice(0, 8));
      }
    } catch {
      // Silent fail
    } finally {
      setScanning(false);
    }
  }, []);

  // Cycle scanner
  useEffect(() => {
    const interval = setInterval(() => {
      const idx = scanIdx.current;
      scanIdx.current = (idx + 1) % SCAN_LIST.length;
      fetchAlert(SCAN_LIST[scanIdx.current]);
    }, 40000);
    return () => clearInterval(interval);
  }, [fetchAlert]);

  // Initial scan
  useEffect(() => {
    fetchAlert(SCAN_LIST[0]);
  }, [fetchAlert]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  // Auto-dismiss after 20s
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setTimeout(() => {
      setAlerts((prev) => prev.slice(0, -1));
    }, 20000);
    return () => clearTimeout(timer);
  }, [alerts]);

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-3 pointer-events-none" style={{ maxWidth: '380px', width: '100%' }}>
      {/* Scanning Indicator */}
      {scanning && (
        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-xl shimmer"
          style={{ background: 'rgba(17,24,39,0.8)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          <div className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--purple)' }} />
          <span className="text-xs text-slate-400">AI scanning market...</span>
        </div>
      )}

      {/* Alert Toasts */}
      <AnimatePresence>
        {alerts.map((alert) => {
          const isBuy = alert.signal === 'BUY';
          const accentColor = isBuy ? 'var(--green)' : 'var(--red)';

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="pointer-events-auto glass-card p-4 cursor-pointer"
              onClick={() => dismissAlert(alert.id)}
              style={{
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}`,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg font-bold text-white">{alert.ticker}</span>
                  <span className={`pill ${isBuy ? 'pill-buy' : 'pill-sell'}`}>
                    {alert.signal}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {alert.thesis?.confidence && (
                    <span className="text-xs font-semibold"
                      style={{ color: alert.thesis.confidence === 'HIGH' ? 'var(--green)' : alert.thesis.confidence === 'MEDIUM' ? 'var(--yellow)' : 'var(--text-muted)' }}>
                      {alert.thesis.confidence}
                    </span>
                  )}
                  <span className="text-xs text-slate-600 num">
                    {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                  </span>
                </div>
              </div>

              {/* Setup */}
              {alert.thesis?.setup && (
                <div className="text-xs font-semibold mb-1.5" style={{ color: accentColor }}>
                  {alert.thesis.setup}
                </div>
              )}

              {/* Thesis */}
              {alert.thesis?.thesis && (
                <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-2">
                  {alert.thesis.thesis}
                </p>
              )}

              {/* Trade Levels */}
              <div className="flex items-center gap-2">
                {[
                  { label: 'Entry', value: alert.thesis?.entry, color: 'var(--text-secondary)' },
                  { label: 'Target', value: alert.thesis?.target, color: 'var(--green)' },
                  { label: 'Stop', value: alert.thesis?.stop, color: 'var(--red)' },
                  { label: 'R/R', value: alert.thesis?.risk_reward, color: 'var(--yellow)' },
                ].filter(i => i.value).map(({ label, value, color }) => (
                  <div key={label} className="flex-1 text-center py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] text-slate-600 mb-0.5">{label}</div>
                    <div className="text-xs font-semibold num" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Payload stats */}
              {alert.payload && (
                <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  {alert.payload.rvol && (
                    <span className="text-[10px] text-slate-600">
                      RVOL <span className="text-slate-400 num">{alert.payload.rvol.toFixed(1)}x</span>
                    </span>
                  )}
                  {alert.payload.vwap && (
                    <span className="text-[10px] text-slate-600">
                      VWAP <span className="text-slate-400 num">${alert.payload.vwap.toFixed(2)}</span>
                    </span>
                  )}
                  {alert.thesis?.timeframe && (
                    <span className="text-[10px] text-slate-500">{alert.thesis.timeframe}</span>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
