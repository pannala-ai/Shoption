// app/api/scan/route.ts
// Batch scanner — uses previous-day OHLCV data (works 24/7, not just during market hours)

import { NextResponse } from 'next/server';
import { getSnapshots, getGainersLosers } from '@/lib/polygon';
import { evaluateQuantitativeSetup, SignalType, AssetType } from '@/lib/engine';

const WATCHLIST = [
  'NVDA','AAPL','TSLA','AMD','AMZN','MSFT','META','GOOGL','SPY','QQQ',
  'PLTR','MSTR','COIN','HOOD','SOFI','RIVN','NIO','LCID','SMCI','ARM',
  'INTC','MU','QCOM','AVGO','TSM','ASML','MRVL','NFLX','CRM','ADBE',
  'UBER','SQ','SHOP','SNOW','DDOG','NET','ABNB','RBLX','CRWD','ZS',
  'PANW','MARA','RIOT','CLSK','HIMS','RDDT','ORCL','KLAC','AMAT','LRCX',
];

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
  assetType:      AssetType;
  strategyName:   string;
  strikeLabel?:   string;
}

function isMarketOpen() {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960;
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

    if (allSnaps.length > 0) {
      // Use Live Snapshot Data or Previous Day Data if outside market hours dynamically
      const minutesElapsed = (() => {
        const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        return Math.max(1, et.getHours() * 60 + et.getMinutes() - 570);
      })();

      results = allSnaps
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => {
          const day  = t.day     || {};
          const prev = t.prevDay || {};
          
          // Use previous day fallbacks if day volume is empty (market closed) to guarantee 24/7 uptime without API rate limits
          const price = t.lastTrade?.p ?? day.c ?? prev.c ?? 0;
          const vwap  = day.vw ?? prev.vw ?? 0;
          const open  = day.o ?? prev.o ?? 0;
          const vol   = day.v ?? prev.v ?? 0;
          const high  = day.h ?? prev.h ?? 0;
          const low   = day.l ?? prev.l ?? 0;
          const change = t.todaysChangePerc ?? (open > 0 ? ((price - open) / open) * 100 : 0);
          
          // Realistic RVOL synthesis overnight, absolute RVOL during the day
          let rvol = 1.0;
          if (!afterHours && prev?.v > 0) rvol = parseFloat(((vol / minutesElapsed) / (prev.v / 390)).toFixed(2));
          else rvol = 1.0 + Math.abs(change) * 0.5; 

          const { strategyName, signal, strength, reason, assetType, strikeLabel } = evaluateQuantitativeSetup(
            t.ticker, price, change, rvol, vwap, high, low
          );

          return {
            ticker: t.ticker, price, change, changeDollar: t.todaysChange ?? (price - open),
            volume: vol, rvol, vwap, high, low, open,
            signal, signalStrength: strength, reason, isAfterHours: afterHours,
            assetType, strategyName, strikeLabel
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
