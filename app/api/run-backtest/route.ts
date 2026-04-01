import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getOptionsChain, getAggBars } from '@/lib/polygon';

const BACKTEST_TICKERS = ['NVDA', 'SPY', 'QQQ', 'AMD', 'TSLA'];

export async function POST() {
  try {
    const fromDate = new Date();
    // Safe Trading Day Logic: Bypass weekends.
    const dayOffset = fromDate.getDay() === 1 ? 3 : fromDate.getDay() === 0 ? 2 : 1;
    fromDate.setDate(fromDate.getDate() - dayOffset);
    const dateStr = fromDate.toISOString().split('T')[0];

    // DB Initialization
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
    
    // Global Debug State 
    let globalBarsChecked = 0;
    let globalSumVol = 0;
    let globalMaxVol = 0;

    for (const baseTicker of BACKTEST_TICKERS) {
      try {
        const chainRes = await getOptionsChain(baseTicker);
        if (!chainRes || !chainRes.results || chainRes.results.length === 0) continue;

        const topContract = chainRes.results.sort((a,b) => (b.day?.volume || 0) - (a.day?.volume || 0))[0];
        const optionTicker = topContract.details.ticker;

        const aggRes = await getAggBars(optionTicker, 1, 'minute', dateStr, dateStr);
        const bars = aggRes.results || [];
        
        if (bars.length < 21) {
            continue; // Need at least 21 bars to calculate a 20-bar trailing SMA safely
        }

        const barsLen = bars.length;
        
        for (let i = 20; i < barsLen; i++) {
            const bar = bars[i];
            
            // Debug Accumulation
            globalBarsChecked++;
            globalSumVol += bar.v;
            if (bar.v > globalMaxVol) globalMaxVol = bar.v;
            
            // Step 1: Calculate V-SMA over the previous 20 bars
            let prevVolSum = 0;
            for (let p = 1; p <= 20; p++) {
                prevVolSum += bars[i - p].v;
            }
            const vSMA = prevVolSum / 20;

            // Step 2: Liquidity Check (Reduced to >10 to capture valid illiquid breakouts)
            if (bar.v <= 10) continue;
            
            // Step 3: Relative Volume (RVOL) > 1.5x (Down from 2.5x to capture regular momentum)
            if (bar.v <= 1.5 * vSMA) continue;
            
            // Step 4: Price Action - Bullish Strength
            const range = bar.h - bar.l;
            if (range <= 0) continue; 
            
            // Must be a green structural candle and close in the upper 40% of its range (abandoning strict 10% Marubozu limit)
            const isGreen = bar.c > bar.o;
            const holdsTopRange = bar.c >= bar.l + (range * 0.60);
            
            if (!isGreen || !holdsTopRange) continue;

            // === SIGNAL TRIGGERED ===
            totalSignals++;
            const entryDate = new Date(bar.t);
            
            // 2% slippage penalty applied to acquire Real Entry Price
            const realEntryPremium = bar.c * 1.02; 
            
            let peakPremium = realEntryPremium;
            let hitTarget = false;
            let stoppedOut = false;
            
            // Target Evaluation
            for (let j = i + 1; j < barsLen; j++) {
                const fwdBar = bars[j];
                
                if (fwdBar.h > peakPremium) {
                    peakPremium = fwdBar.h;
                }
                
                // Loss Condition First (High Volatility Defense)
                if (fwdBar.l <= realEntryPremium * 0.95) {
                    stoppedOut = true;
                } 
                // Win Condition
                if (!stoppedOut && fwdBar.h >= realEntryPremium * 1.10) {
                    hitTarget = true;
                }
                
                if (hitTarget || stoppedOut) {
                    break;
                }
            }
            
            const maxGainPct = ((peakPremium - realEntryPremium) / realEntryPremium) * 100;
            const signalDirection = topContract.details.contract_type === 'call' ? 'BUY' : 'SELL';

            insertStmt.run(
               `${optionTicker}-${bar.t}`,
               optionTicker,
               signalDirection,
               bar.t,
               entryDate.toISOString().split('T')[0],
               bar.c, 
               peakPremium,
               peakPremium,
               realEntryPremium,
               maxGainPct,
               hitTarget ? 1 : 0,
               99, 
               'Anomalous Momentum Breakout (RVOL > 1.5, Trend Control)'
            );

            i += 15; // Anti-stutter
        }
      } catch (err: any) {
        console.error(`Failed backtesting ${baseTicker}`, err.message);
      }
    }
    
    // Target Analytics
    if (totalSignals === 0) {
        const avgVol = globalBarsChecked > 0 ? (globalSumVol / globalBarsChecked) : 0;
        console.log(`Backtest Debug: Checked ${globalBarsChecked} bars, Avg Vol was ${avgVol.toFixed(2)}, Max Vol was ${globalMaxVol}`);
    }

    const finalResults = db.prepare('SELECT * FROM backtests').all();
    console.log("BACKTEST RESULTS PAYLOAD:", JSON.stringify(finalResults, null, 2));

    return NextResponse.json({ success: true, signalsGenerated: totalSignals });
  } catch (err: any) {
    console.error('CRITICAL BACKTEST FAILURE:', err.message);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg, stack: err.stack }, { status: 500 });
  }
}
