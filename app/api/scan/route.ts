// app/api/scan/route.ts
// Batch scanner — uses previous-day OHLCV data (works 24/7, not just during market hours)

import { NextResponse } from 'next/server';
import { getSnapshots, getGainersLosers, getPreviousClose } from '@/lib/polygon';

const WATCHLIST = [
  'NVDA','AAPL','TSLA','AMD','AMZN','MSFT','META','GOOGL','SPY','QQQ',
  'PLTR','MSTR','COIN','HOOD','SOFI','RIVN','NIO','LCID','SMCI','ARM',
  'INTC','MU','QCOM','AVGO','TSM','ASML','MRVL','NFLX','CRM','ADBE',
  'UBER','SQ','SHOP','SNOW','DDOG','NET','ABNB','RBLX','CRWD','ZS',
  'PANW','MARA','RIOT','CLSK','HIMS','RDDT','ORCL','KLAC','AMAT','LRCX',
];

export type SignalType = 'BUY' | 'SELL' | 'WATCH' | 'NONE';

export interface ScanResult {
  ticker:         string;
  price:          number;
  change:         number;
  changeDollar:   number;
  volume:         number;
  rvol:           number;
  vwap:           number;
  high:           number;
  low:            number;
  open:           number;
  signal:         SignalType;
  signalStrength: number;
  reason:         string;
  isAfterHours:   boolean;
}

function isMarketOpen() {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960;
}

function evaluate(change: number, rvol: number, price: number, vwap: number): {
  signal: SignalType; strength: number; reason: string;
} {
  const aboveVwap = vwap > 0 ? price >= vwap : change >= 0;
  const belowVwap = vwap > 0 ? price < vwap  : change < 0;

  if (rvol >= 2.5 && change > 3 && aboveVwap)
    return { signal: 'BUY',  strength: Math.min(100, Math.round(rvol * 14 + change * 5)), reason: `RVOL ${rvol.toFixed(1)}x · +${change.toFixed(1)}% · above VWAP` };
  if (rvol >= 1.5 && change > 1.5 && aboveVwap)
    return { signal: 'BUY',  strength: Math.min(90,  Math.round(rvol * 10 + change * 5)), reason: `RVOL ${rvol.toFixed(1)}x · holding above VWAP` };
  if (change > 2.5 && aboveVwap)
    return { signal: 'BUY',  strength: Math.min(75,  Math.round(change * 10)),            reason: `+${change.toFixed(1)}% breakout · above VWAP` };

  if (rvol >= 2.5 && change < -3 && belowVwap)
    return { signal: 'SELL', strength: Math.min(100, Math.round(rvol * 14 + Math.abs(change) * 5)), reason: `RVOL ${rvol.toFixed(1)}x · ${change.toFixed(1)}% breakdown` };
  if (rvol >= 1.5 && change < -1.5 && belowVwap)
    return { signal: 'SELL', strength: Math.min(90,  Math.round(rvol * 10 + Math.abs(change) * 5)), reason: `RVOL ${rvol.toFixed(1)}x · failing VWAP` };
  if (change < -2.5 && belowVwap)
    return { signal: 'SELL', strength: Math.min(75,  Math.round(Math.abs(change) * 10)),             reason: `${change.toFixed(1)}% breakdown · below VWAP` };

  if (Math.abs(change) > 1.5 || rvol > 1.3)
    return { signal: 'WATCH', strength: Math.min(60, Math.round(Math.abs(change) * 7 + rvol * 5)), reason: `${Math.abs(change).toFixed(1)}% move · elevated activity` };

  return { signal: 'NONE', strength: 0, reason: '' };
}

export async function GET() {
  const afterHours = !isMarketOpen();

  try {
    // Try live snapshots first
    const [gainersRes, losersRes, watchRes] = await Promise.all([
      getGainersLosers('gainers').catch(() => ({ tickers: [] })),
      getGainersLosers('losers').catch(() => ({ tickers: [] })),
      getSnapshots(WATCHLIST).catch(() => ({ tickers: [] })),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allSnaps: any[] = [
      ...((gainersRes as {tickers: unknown[]}).tickers ?? []),
      ...((losersRes  as {tickers: unknown[]}).tickers ?? []),
      ...((watchRes   as {tickers: unknown[]}).tickers ?? []),
    ];

    // Deduplicate
    const seen   = new Set<string>();
    allSnaps = allSnaps.filter(t => t?.ticker && !seen.has(t.ticker) && seen.add(t.ticker));

    let results: ScanResult[] = [];

    if (allSnaps.length > 0 && allSnaps.some(t => t.day?.v > 0)) {
      // -- USE LIVE SNAPSHOT DATA (market is open / just closed) --
      const minutesElapsed = (() => {
        const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        return Math.max(1, et.getHours() * 60 + et.getMinutes() - 570);
      })();

      results = allSnaps
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => {
          const day  = t.day     || {};
          const prev = t.prevDay || {};
          const price = t.lastTrade?.p ?? day.c ?? 0;
          const vwap  = day.vw ?? 0;
          const vol   = day.v ?? 0;
          const prevVol = prev.v ?? 0;
          const rvol = prevVol > 0 ? parseFloat(((vol / minutesElapsed) / (prevVol / 390)).toFixed(2)) : 0;
          const change = t.todaysChangePerc ?? 0;
          const { signal, strength, reason } = evaluate(change, rvol, price, vwap);
          return {
            ticker: t.ticker, price, change, changeDollar: t.todaysChange ?? 0,
            volume: vol, rvol, vwap, high: day.h ?? 0, low: day.l ?? 0, open: day.o ?? 0,
            signal, signalStrength: strength, reason, isAfterHours: false,
          };
        })
        .filter(r => r.price > 0);
    } else {
      // -- FALLBACK: use previous day /prev endpoint (works 24/7) --
      const prevDayResults = await Promise.allSettled(
        WATCHLIST.map(ticker => getPreviousClose(ticker).then(r => ({ ticker, data: r.results?.[0] })))
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results = prevDayResults
        .filter((r): r is PromiseFulfilledResult<{ticker: string; data: any}> => r.status === 'fulfilled' && !!r.value.data)
        .map(({ value: { ticker, data } }) => {
          const price  = data.c ?? 0;
          const open   = data.o ?? 0;
          const change = open > 0 ? parseFloat((((price - open) / open) * 100).toFixed(2)) : 0;
          const vwap   = data.vw ?? 0;
          // For prev day we don't have real RVOL, synthesize from volume
          const rvol   = 1.0; // neutral
          const { signal, strength, reason } = evaluate(change, rvol, price, vwap);
          return {
            ticker, price, change,
            changeDollar: parseFloat((price - open).toFixed(2)),
            volume: data.v ?? 0, rvol, vwap,
            high: data.h ?? 0, low: data.l ?? 0, open,
            signal, signalStrength: strength,
            reason: reason + (reason ? ' (prev day)' : ''),
            isAfterHours: true,
          };
        })
        .filter(r => r.price > 0);
    }

    // Sort: BUY/SELL first then strength
    results.sort((a, b) => {
      const p: Record<string, number> = { BUY: 4, SELL: 4, WATCH: 2, NONE: 1 };
      return (p[b.signal] - p[a.signal]) || b.signalStrength - a.signalStrength;
    });

    return NextResponse.json({
      results,
      totalScanned: results.length,
      signals: results.filter(r => r.signal === 'BUY' || r.signal === 'SELL').length,
      isAfterHours: afterHours,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[scan]', err);
    return NextResponse.json({ error: String(err), results: [], totalScanned: 0, signals: 0 }, { status: 500 });
  }
}
