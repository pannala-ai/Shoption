import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import db from '@/lib/db';
import { evaluateQuantitativeSetup } from '@/lib/engine';
import { getAggBars } from '@/lib/polygon';

const BACKTEST_TICKERS = ['NVDA', 'TSLA', 'SPY', 'QQQ', 'AMD', 'AAPL', 'META', 'COIN', 'MSTR'];

export async function POST() {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 6); // Grab last 5 days approximately

    // Database Initialization Safety: Explicitly force table structure matching production requirements
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS backtests (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          signal TEXT,
          entryTime INTEGER,
          entryDate TEXT,
          entryPrice REAL,
          peakPrice REAL,
          peakPremium REAL,
          entryPremium REAL,
          maxGainPct REAL,
          hitTarget INTEGER,
          strength INTEGER,
          reason TEXT
        );
      `);
      // Clear previous backtest table to keep it fresh for this run
      db.exec(`DELETE FROM backtests;`);
    } catch (dbErr: any) {
      console.error(`[DB ERROR] Failed to initialize SQLite Database. Exact error: ${dbErr.message}`);
      return NextResponse.json({ success: false, error: 'Database Initialization Failed' }, { status: 500 });
    }

    const insertStmt = db.prepare(`
      INSERT INTO backtests (id, ticker, signal, entryTime, entryDate, entryPrice, peakPrice, peakPremium, entryPremium, maxGainPct, hitTarget, strength, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalSignals = 0;

    for (const ticker of BACKTEST_TICKERS) {
      try {
        // Use default return format which explicitly includes meta and quotes to fix TS types
        const result = (await yahooFinance.chart(ticker, {
          period1: fromDate,
          interval: '1m'
        })) as any;

        if (!result || !result.meta || !result.quotes || result.quotes.length === 0) continue;

        // Group by day to calculate discrete intraday VWAP and initial volume baseline
        const quotesByDay = new Map<string, any[]>();
        
        for (const q of result.quotes) {
          if (!q.date || !q.volume || q.close == null) continue;
          const dateStr = q.date.toISOString().split('T')[0];
          if (!quotesByDay.has(dateStr)) quotesByDay.set(dateStr, []);
          quotesByDay.get(dateStr)!.push(q);
        }

        const days = Array.from(quotesByDay.values());

        // Process day by day
        for (let d = 1; d < days.length; d++) {
           const prevDayVolume = days[d-1].reduce((sum: number, q: any) => sum + (q.volume || 0), 0);
           const prevDayBars = days[d-1].length;
           const avgVolPerMin = Math.max(1, prevDayVolume / (prevDayBars || 390));
           
           const intraday = days[d];
           if (intraday.length === 0) continue;
           
           let cumVol = 0;
           let cumPV = 0;
           let open = intraday[0].open || intraday[0].close;

           // We must find trailing peak premium forward.
           for (let i = 15; i < intraday.length; i++) {
             const m = intraday[i];
             if (!m.close || !m.high || !m.low || !m.volume) continue;

             // Calculate Intraday VWAP incrementally
             const tp = (m.high + m.low + m.close) / 3;
             cumVol += m.volume;
             cumPV += tp * m.volume;
             const vwap = cumPV / cumVol;

             // Minutes elapsed
             const mins = i + 1;
             
             // RVOL Approximation
             const expectedHistoricalVol = avgVolPerMin * mins;
             const rvol = expectedHistoricalVol > 0 ? parseFloat((cumVol / expectedHistoricalVol).toFixed(2)) : 1.0;

             // Math.abs(Change) %
             const change = open > 0 ? ((m.close - open) / open) * 100 : 0;

             // Test the Engine
             const setup = evaluateQuantitativeSetup(
               ticker, m.close, change, rvol, vwap, m.high, m.low
             );

             // If absolute Grade A (> 90 strength)
             if (setup.signal === 'BUY' || setup.signal === 'SELL') {
                totalSignals++;

                // Trigger reached! Transition out of Black-Scholes completely.
                // Reconstruct the precise Option Ticker required by Polygon REST API for fetching real historical tick data
                const entryDate = new Date(m.date);
                const entryPrice = m.close;
                
                // Determine Next Friday Expiry
                const expDate = new Date(entryDate);
                const dayOffset = (5 - expDate.getDay() + 7) % 7 || 7;
                expDate.setDate(expDate.getDate() + dayOffset);
                const expStr = expDate.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
                
                // Establish realistic strike (Standard 1% to 2% out of the money)
                const isBullish = setup.signal === 'BUY';
                const strikeOffset = isBullish ? 1.01 : 0.99;
                let strikeValue = entryPrice * strikeOffset;
                if (entryPrice > 100) strikeValue = Math.round(strikeValue / 5) * 5;
                else strikeValue = Math.round(strikeValue);

                const paddedStrike = (strikeValue * 1000).toString().padStart(8, '0');
                const typeChar = isBullish ? 'C' : 'P';
                const optionTicker = `O:${ticker}${expStr}${typeChar}${paddedStrike}`;
                
                // Calculate hold timeline up to 2 days forward targeting 10% peak
                const endDate = new Date(entryDate);
                endDate.setDate(endDate.getDate() + 2);
                
                // Execute explicit exact Option data fetching from Polygon.io endpoint (wss:// Delayed or REST)
                let optionBars: any[] = [];
                try {
                   // Real OREVIX Data Fetch: Pull actual 1-minute bars for the SPECIFIC option contract
                   const polyRes = await getAggBars(optionTicker, 1, 'minute', entryDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
                   optionBars = polyRes.results || [];
                   
                   if (optionBars.length === 0) {
                       console.error(`[Polygon API] No data returned for option ticker: ${optionTicker}. This usually indicates a malformed ticker or zero volume day.`);
                   }
                } catch (apiErr: any) {
                   console.error(`[Polygon API ERROR] Failed to fetch aggregate bars for literal ticker ${optionTicker} | Error Message: ${apiErr.message}`);
                   // Do not let it fail silently: Break loop iteration and move to next signal instead of mocking
                   continue;
                }

                let entryPremium = 0;
                let peakPremium = 0;
                let peakPrice = entryPrice;
                
                if (optionBars.length > 0) {
                   // Find precisely the bar matching our exact trigger minute
                   const startBarIdx = optionBars.findIndex((b: any) => b.t >= entryDate.getTime());
                   if (startBarIdx >= 0) {
                       // OREVIX SLIPPAGE PENALTY: 3% penalty imposed upon execution against the bid/ask spread
                       entryPremium = optionBars[startBarIdx].c * 1.03; 
                       peakPremium = entryPremium;

                       // Forward sweep the exact historical reality options tape to verify the explicit target margin
                       for (let k = startBarIdx; k < optionBars.length; k++) {
                           const fbar = optionBars[k];
                           if (fbar.h > peakPremium) {
                               peakPremium = fbar.h;
                               // We don't have perfect underlying sync tracking here for fallback, so approximate
                               peakPrice = entryPrice * (isBullish ? 1.05 : 0.95); 
                           }
                           
                           // Terminate immediately upon 10% structural gain completion
                           if ((peakPremium / entryPremium) >= 1.10) {
                               break;
                           }
                       }
                   }
                } else {
                    // Signal invalidated due to missing data. Log failure and abort fake testing.
                    console.log(`[Backtester] Skipping invalid signal entry for ${optionTicker}: Zero structural bars found during requested period.`);
                }

                if (entryPremium > 0) {
                    const maxGainPct = ((peakPremium - entryPremium) / entryPremium) * 100;
                    const hitTarget = maxGainPct >= 10.0;

                    insertStmt.run(
                       `${ticker}-${entryDate.getTime()}`,
                       ticker,
                       setup.signal,
                       entryDate.getTime(),
                       entryDate.toISOString().split('T')[0],
                       entryPrice,
                       Math.round(peakPrice * 100) / 100,
                       Math.round(peakPremium * 100) / 100,
                       Math.round(entryPremium * 100) / 100,
                       Math.round(maxGainPct * 100) / 100,
                       hitTarget ? 1 : 0,
                       setup.strength,
                       setup.reason
                    );
                }
                
                // Jump index forward so we don't double log the exact same momentum spike all day
                i += 60; 
             }
           }
        }
      } catch (err) {
        console.error(`Failed backtesting ${ticker}`, err);
      }
    }

    return NextResponse.json({ success: true, signalsGenerated: totalSignals });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Backtest error', errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
