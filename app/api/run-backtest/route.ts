import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import db from '@/lib/db';
import { evaluateQuantitativeSetup, calculateBSMGreeks } from '@/lib/engine';

const BACKTEST_TICKERS = ['NVDA', 'TSLA', 'SPY', 'QQQ', 'AMD', 'AAPL', 'META', 'COIN', 'MSTR'];

export async function POST() {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 6); // Grab last 5 days approximately

    // Clear previous backtest table to keep it fresh
    db.exec(`DELETE FROM backtests;`);
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

                // Trigger reached! Let's forward-test the remaining intraday ticks
                const entryDate = m.date;
                const entryPrice = m.close;
                
                // Assume 1-4 week DTE, conservative IV
                const T = 14 / 365; 
                const iv = 0.45; 
                const r = 0.05;

                // Strike approximation based on signal 
                const strikeOffset = setup.signal === 'BUY' ? 1.02 : 0.98; // 2% OTM
                const K = entryPrice * strikeOffset;
                const optionType = setup.signal === 'BUY' ? 'call' : 'put';

                const bsmEntry = calculateBSMGreeks(entryPrice, K, T, r, iv, optionType);
                const entryPremium = bsmEntry.theoreticalPremium;

                let peakPremium = entryPremium;
                let peakPrice = entryPrice;

                // Forward sweep intraday to determine maximum potential 10% hit
                for (let j = i; j < intraday.length; j++) {
                  const fwd = intraday[j];
                  if (!fwd.close) continue;
                  
                  // Rough spot premium calculation representing max intraday tracking
                  const fwdSpot = setup.signal === 'BUY' ? fwd.high : fwd.low;
                  if (!fwdSpot) continue;

                  const bsmFwd = calculateBSMGreeks(fwdSpot, K, T, r, iv, optionType);
                  const fwdPrem = bsmFwd.theoreticalPremium;
                  
                  if (fwdPrem > peakPremium) {
                    peakPremium = fwdPrem;
                    peakPrice = fwdSpot;
                  }

                  // 10% explicit target hit
                  if (entryPremium > 0 && (peakPremium / entryPremium) >= 1.10) {
                     break; // Goal secured! Time to lock the scan logic.
                  }
                }

                const maxGainPct = entryPremium > 0 ? ((peakPremium - entryPremium) / entryPremium) * 100 : 0;
                const hitTarget = maxGainPct >= 10.0;

                insertStmt.run(
                   `${ticker}-${entryDate.getTime()}`,
                   ticker,
                   setup.signal,
                   entryDate.getTime(),
                   entryDate.toISOString().split('T')[0],
                   entryPrice,
                   peakPrice,
                   peakPremium,
                   entryPremium,
                   maxGainPct,
                   hitTarget ? 1 : 0,
                   setup.strength,
                   setup.reason
                );
                
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
