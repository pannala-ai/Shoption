// app/api/movers/route.ts
// Returns top movers sorted by RVOL for the Daily Movers leaderboard

import { NextResponse } from 'next/server';
import { getGainersLosers, getSnapshots } from '@/lib/polygon';

// Default watchlist of high-liquidity tickers for RVOL scanning
const DEFAULT_TICKERS = [
  'NVDA','AAPL','TSLA','AMD','AMZN','MSFT','META','GOOGL','SPY','QQQ',
  'PLTR','MSTR','COIN','HOOD','SOFI','RIVN','NIO','LCID','SMCI','ARM',
  'INTC','MU','QCOM','AVGO','TSM','ASML','MRVL','LRCX','KLAC','AMAT',
];

export async function GET() {
  try {
    const [gainers, losers, watchlist] = await Promise.all([
      getGainersLosers('gainers').catch(() => ({ tickers: [] })),
      getGainersLosers('losers').catch(() => ({ tickers: [] })),
      getSnapshots(DEFAULT_TICKERS).catch(() => ({ tickers: [] })),
    ]);

    // Merge all snapshots, deduplicate by ticker
    const allTickers = [
      ...(gainers.tickers || []),
      ...(losers.tickers || []),
      ...(watchlist.tickers || []),
    ];

    const seen = new Set<string>();
    const unique = allTickers.filter((t) => {
      if (seen.has(t.ticker)) return false;
      seen.add(t.ticker);
      return true;
    });

    // Calculate RVOL: day volume vs previous day volume (proxy for 10d avg)
    const enriched = unique
      .filter((t) => t.day && t.prevDay)
      .map((t) => {
        const minutesElapsed = Math.max(1, getMinutesIntoTradingDay());
        const currentMinuteVol = t.day.v / minutesElapsed;
        const prevDayMinuteVol = t.prevDay.v / 390; // 390 trading minutes
        const rvol = prevDayMinuteVol > 0 ? parseFloat((currentMinuteVol / prevDayMinuteVol).toFixed(2)) : 0;

        return {
          ticker: t.ticker,
          price: t.lastTrade?.p ?? t.day.c,
          change: t.todaysChangePerc,
          changeDollar: t.todaysChange,
          volume: t.day.v,
          rvol,
          vwap: t.day.vw,
          high: t.day.h,
          low: t.day.l,
          open: t.day.o,
        };
      })
      .sort((a, b) => b.rvol - a.rvol)
      .slice(0, 30);

    return NextResponse.json({ movers: enriched, timestamp: Date.now() });
  } catch (err) {
    console.error('[movers]', err);
    return NextResponse.json({ error: 'Failed to fetch movers', movers: [] }, { status: 500 });
  }
}

function getMinutesIntoTradingDay(): number {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM ET
  return Math.max(1, totalMinutes - marketOpen);
}
