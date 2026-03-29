// app/api/chart/route.ts
// Returns OHLCV bars for TradingView chart rendering

import { NextRequest, NextResponse } from 'next/server';
import { getAggBars } from '@/lib/polygon';
import { calculateRunningVWAP } from '@/lib/engine';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'NVDA';
  const span = req.nextUrl.searchParams.get('span') ?? 'day'; // 'day' | 'week'

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const fromDate = span === 'week'
    ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : todayStr;

  try {
    const bars = await getAggBars(ticker.toUpperCase(), 1, 'minute', fromDate, todayStr);
    const results = bars.results ?? [];

    const candles = results.map((r) => ({
      time: Math.floor(r.t / 1000) as number,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));

    const vwapBands = calculateRunningVWAP(candles);

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      candles,
      vwapBands,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[chart]', err);
    return NextResponse.json({ error: 'Failed to fetch chart data', candles: [], vwapBands: [] }, { status: 500 });
  }
}

