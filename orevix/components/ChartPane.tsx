'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, CandlestickSeries, UTCTimestamp } from 'lightweight-charts';

interface ChartPaneProps {
  ticker: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VWAPBandPoint {
  time: number;
  vwap: number;
  upper1: number; upper2: number;
  lower1: number; lower2: number;
}

export default function ChartPane({ ticker }: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<{ price: number; change: number } | null>(null);
  const [span, setSpan] = useState<'day' | 'week'>('day');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#71717a',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(39,39,42,0.5)' },
        horzLines: { color: 'rgba(39,39,42,0.5)' },
      },
      crosshair: {
        vertLine: { color: '#52525b', width: 1, style: 1, labelBackgroundColor: '#18181b' },
        horzLine: { color: '#52525b', width: 1, style: 1, labelBackgroundColor: '#18181b' },
      },
      rightPriceScale: {
        borderColor: '#27272a',
        textColor: '#71717a',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff00',
      downColor: '#ff3333',
      borderUpColor: '#00ff00',
      borderDownColor: '#ff3333',
      wickUpColor: '#00aa00',
      wickDownColor: '#cc0000',
    });

    // VWAP line
    const vwapSeries = chart.addSeries(LineSeries, {
      color: '#00d4ff',
      lineWidth: 1,
      title: 'VWAP',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    // Upper band σ1
    const upper1 = chart.addSeries(LineSeries, {
      color: 'rgba(0, 212, 255, 0.35)',
      lineWidth: 1,
      lineStyle: 2, // dashed
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      title: '+1σ',
    });

    // Lower band σ1
    const lower1 = chart.addSeries(LineSeries, {
      color: 'rgba(0, 212, 255, 0.35)',
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      title: '-1σ',
    });

    // Upper band σ2
    const upper2 = chart.addSeries(LineSeries, {
      color: 'rgba(0, 212, 255, 0.2)',
      lineWidth: 1,
      lineStyle: 3,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const lower2 = chart.addSeries(LineSeries, {
      color: 'rgba(0, 212, 255, 0.2)',
      lineWidth: 1,
      lineStyle: 3,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    setLoading(true);

    fetch(`/api/chart?ticker=${ticker}&span=${span}`)
      .then((r) => r.json())
      .then((data: { candles: CandleData[]; vwapBands: VWAPBandPoint[] }) => {
        if (!data.candles?.length) return;

        const candles = data.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        candleSeries.setData(candles);

        // Build running VWAP + band lines from per-bar data
        const bands = data.vwapBands ?? [];
        const vwapLine = bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.vwap }));
        const u1Line   = bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.upper1 }));
        const l1Line   = bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.lower1 }));
        const u2Line   = bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.upper2 }));
        const l2Line   = bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.lower2 }));

        vwapSeries.setData(vwapLine);
        upper1.setData(u1Line);
        lower1.setData(l1Line);
        upper2.setData(u2Line);
        lower2.setData(l2Line);

        chart.timeScale().fitContent();

        const last = data.candles[data.candles.length - 1];
        const first = data.candles[0];
        const changeAmt = last.close - first.open;
        const changePct = (changeAmt / first.open) * 100;
        setSnapshot({ price: last.close, change: changePct });
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Resize handler
    const ro = new ResizeObserver(() => {
      if (container && chart) {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ticker, span]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      {/* Chart Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-bold mono text-sm">{ticker}</span>
          {snapshot && (
            <>
              <span className="mono text-sm text-zinc-300">${snapshot.price.toFixed(2)}</span>
              <span
                className="mono text-xs font-semibold"
                style={{ color: snapshot.change >= 0 ? '#00ff00' : '#ff3333' }}
              >
                {snapshot.change >= 0 ? '+' : ''}{snapshot.change.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* VWAP Legend */}
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ background: '#00d4ff' }} />
            <span className="text-[9px] text-zinc-600 mono">VWAP</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 border-dashed border-t" style={{ borderColor: 'rgba(0,212,255,0.4)' }} />
            <span className="text-[9px] text-zinc-600 mono">±1σ</span>
          </div>
          {/* Span Selector */}
          <div className="flex ml-2">
            {(['day', 'week'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpan(s)}
                className="px-2 py-0.5 text-[9px] mono uppercase font-semibold transition-colors"
                style={{
                  color: span === s ? '#00ff00' : '#52525b',
                  border: '1px solid',
                  borderColor: span === s ? '#00ff00' : '#27272a',
                  borderRadius: s === 'day' ? '3px 0 0 3px' : '0 3px 3px 0',
                  background: span === s ? 'rgba(0,255,0,0.06)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {s === 'day' ? '1D' : '1W'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black bg-opacity-80">
            <div className="text-xs mono text-zinc-600">LOADING CHART DATA...</div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
