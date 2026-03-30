// app/api/options-tape/route.ts
// Returns options flow — uses live Polygon data when available, falls back to
// generated realistic options based on today's scanner results

import { NextResponse } from 'next/server';
import { getOptionsChain, getPreviousClose } from '@/lib/polygon';
import { detectUOA, calculateBSMGreeks } from '@/lib/engine';

const SCAN_TICKERS = [
  'NVDA','AAPL','TSLA','AMD','AMZN','MSFT','META','GOOGL','SPY','QQQ',
  'PLTR','MSTR','COIN','SMCI','ARM','INTC','MU','AVGO','MRVL','HOOD',
];

export async function GET() {
  try {
    // ── Try real options chain data first ──────────────────────────────
    const liveResults = await Promise.allSettled(
      SCAN_TICKERS.slice(0, 6).map(async (t) => {
        const chain = await getOptionsChain(t);
        return { ticker: t, contracts: chain.results ?? [] };
      })
    );

    const tape: OptionsTapeRow[] = [];

    for (const result of liveResults) {
      if (result.status !== 'fulfilled') continue;
      const { ticker: sym, contracts } = result.value;

      for (const contract of contracts) {
        const { details, day, greeks, open_interest, implied_volatility, underlying_asset } = contract;
        if (!details || !day) continue;

        const vol = day.volume ?? 0;
        const oi  = open_interest ?? 0;
        const spotPrice = underlying_asset?.price ?? 0;

        if (vol < 10 && oi < 50) continue;

        const uoa = detectUOA({
          strike:      details.strike_price,
          callVolume:  details.contract_type === 'call' ? vol : 0,
          putVolume:   details.contract_type === 'put'  ? vol : 0,
          callOI:      details.contract_type === 'call' ? oi : 0,
          putOI:       details.contract_type === 'put'  ? oi : 0,
          callGamma:   greeks?.gamma ?? 0,
          putGamma:    greeks?.gamma ?? 0,
          spotPrice,
        });

        let computedGreeks = greeks;
        if (!greeks?.delta || !greeks?.gamma) {
          const dte = Math.max(0.001, getDaysToExpiry(details.expiration_date) / 365);
          computedGreeks = calculateBSMGreeks(
            spotPrice, details.strike_price, dte, 0.05,
            implied_volatility ?? 0.3, details.contract_type
          );
        }

        tape.push({
          id:             `${sym}-${details.ticker}-${Date.now()}`,
          ticker:         sym,
          contractTicker: details.ticker,
          type:           details.contract_type,
          strike:         details.strike_price,
          expiry:         details.expiration_date,
          volume:         vol,
          openInterest:   oi,
          volumeOIRatio:  oi > 0 ? parseFloat((vol / oi).toFixed(2)) : 0,
          isUnusual:      uoa.isUnusual,
          isOTM:          details.contract_type === 'call' ? details.strike_price > spotPrice : details.strike_price < spotPrice,
          impliedVol:     implied_volatility,
          delta:          computedGreeks?.delta ?? 0,
          gamma:          computedGreeks?.gamma ?? 0,
          spot:           spotPrice,
          premium:        day.close ?? 0,
          timestamp:      Date.now(),
        });
      }
    }

    // ── Fallback: generate realistic options natively when 429 blocked ──
    if (tape.length === 0) {
      let coreSeed = Date.now() / 100000;
      for (const ticker of SCAN_TICKERS.slice(0, 14)) {
        let hash = 0;
        for (let i = 0; i < ticker.length; i++) hash = ((hash << 5) - hash) + ticker.charCodeAt(i);
        const rand = Math.abs(hash * coreSeed) % 1;
        
        const spot = 50 + rand * 300;
        const change = (rand - 0.5) * 6;
        const isMarketBullish = change > 0;

        // Generate 2 contracts per ticker (one call, one put weighted by trend)
        const contracts = [
          { type: isMarketBullish ? 'call' : 'put',  offset:  1.02 },
          { type: isMarketBullish ? 'call' : 'put',  offset:  1.05 },
        ] as const;

        for (const { type, offset } of contracts) {
          const strike = parseFloat((spot * offset).toFixed(spot > 100 ? 0 : 2));
          const expDate = nextFriday();
          const vol = Math.abs(Math.round(rand * 8000)) + 500;
          const oi  = Math.abs(Math.round(rand * 20000)) + 2000;
          const iv  = 0.25 + (Math.abs(change) / 100) * 2;

          const greeks = calculateBSMGreeks(spot, strike, 7 / 365, 0.05, iv, type);
          const isUnusual = vol / oi > 0.5;

          tape.push({
            id:             `${ticker}-${type}-${strike}-gen`,
            ticker,
            contractTicker: `${ticker}${expDate.replace(/-/g,'').slice(2)}${type[0].toUpperCase()}${Math.round(strike * 1000).toString().padStart(8,'0')}`,
            type,
            strike,
            expiry:         expDate,
            volume:         vol,
            openInterest:   oi,
            volumeOIRatio:  parseFloat((vol / oi).toFixed(2)),
            isUnusual,
            isOTM:          type === 'call' ? strike > spot : strike < spot,
            impliedVol:     iv,
            delta:          greeks?.delta ?? 0,
            gamma:          greeks?.gamma ?? 0,
            spot,
            premium:        parseFloat((Math.abs(spot - strike) * 0.15 + iv * spot * 0.05).toFixed(2)),
            timestamp:      Date.now(),
            isGenerated:    true,
          });
        }
      }
    }

    // Sort: unusual first, then by volume
    tape.sort((a, b) => {
      if (a.isUnusual && !b.isUnusual) return -1;
      if (!a.isUnusual && b.isUnusual) return 1;
      return b.volume - a.volume;
    });

    return NextResponse.json({ tape: tape.slice(0, 40), timestamp: Date.now() });
  } catch (err) {
    console.error('[options-tape]', err);
    return NextResponse.json({ error: 'Failed', tape: [] }, { status: 500 });
  }
}

function getDaysToExpiry(exp: string): number {
  return Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000));
}

function nextFriday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + ((5 - day + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export interface OptionsTapeRow {
  id:             string;
  ticker:         string;
  contractTicker: string;
  type:           'call' | 'put';
  strike:         number;
  expiry:         string;
  volume:         number;
  openInterest:   number;
  volumeOIRatio:  number;
  isUnusual:      boolean;
  isOTM:          boolean;
  impliedVol:     number;
  delta:          number;
  gamma:          number;
  spot:           number;
  premium:        number;
  timestamp:      number;
  isGenerated?:   boolean;
}
