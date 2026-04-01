import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getOptionsChain, getAggBars } from '@/lib/polygon';

const BACKTEST_TICKERS = ['NVDA', 'SPY', 'QQQ', 'AMD', 'TSLA']; // High liquidity target bounds

export async function POST() {
  try {
    const fromDate = new Date();
    // Safe Trading Day Logic: Bypass weekend closures cleanly. If Mon, go back 3 (Friday), if Sun go back 2 (Friday), else 1 (Yesterday)
    const dayOffset = fromDate.getDay() === 1 ? 3 : fromDate.getDay() === 0 ? 2 : 1;
    fromDate.setDate(fromDate.getDate() - dayOffset);
    const dateStr = fromDate.toISOString().split('T')[0];

    // Database Initialization Safety
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

    for (const baseTicker of BACKTEST_TICKERS) {
      try {
        // Step 1: Identify the absolute highest volume options contract currently on the chain for this ticker
        const chainRes = await getOptionsChain(baseTicker);
        if (!chainRes || !chainRes.results || chainRes.results.length === 0) continue;

        const topContract = chainRes.results.sort((a,b) => (b.day?.volume || 0) - (a.day?.volume || 0))[0];
        const optionTicker = topContract.details.ticker;

        // Step 2: Extract real OHLCV 1-minute Option Level aggregates
        const aggRes = await getAggBars(optionTicker, 1, 'minute', dateStr, dateStr);
        const bars = aggRes.results || [];
        
        if (bars.length === 0) {
            console.log(`[Backtester] Skipping ${optionTicker}: Zero structural bars found on ${dateStr}`);
            continue;
        }

        const barsLen = bars.length;
        
        // Step 3: Execute "Premium Momentum Breakout" Algorithmic evaluation over strict Options Flow
        for (let i = 0; i < barsLen; i++) {
            const bar = bars[i];
            
            // Criteria A: Base Liquidity Filter
            if (bar.v < 50) continue;
            
            // Criteria B: Explosive Value Surge
            if (bar.o <= 0) continue;
            const surgePct = (bar.c - bar.o) / bar.o;
            
            if (surgePct >= 0.05) { // Minimum +5% Intraday Jump 
                totalSignals++;

                const entryDate = new Date(bar.t);
                const entryPremium = bar.c; 

                // Target Evaluation: Forward sweep to lock Peak Premium
                let peakPremium = entryPremium;
                
                for (let j = i + 1; j < barsLen; j++) {
                    const fwdBar = bars[j];
                    if (fwdBar.h > peakPremium) {
                        peakPremium = fwdBar.h;
                    }
                }
                
                const maxGainPct = ((peakPremium - entryPremium) / entryPremium) * 100;
                const hitTarget = maxGainPct >= 10.0;
                
                const signalDirection = topContract.details.contract_type === 'call' ? 'BUY' : 'SELL';

                insertStmt.run(
                   `${optionTicker}-${bar.t}`,
                   optionTicker,
                   signalDirection,
                   bar.t,
                   entryDate.toISOString().split('T')[0],
                   entryPremium, 
                   peakPremium,
                   peakPremium,
                   entryPremium,
                   maxGainPct,
                   hitTarget ? 1 : 0,
                   99, 
                   'Premium Momentum Breakout (Vol ≥50, Surge ≥5%)'
                );

                // Anti-Stutter limit: Throttle sequential triggers inside the exact same momentum spike
                i += 15; 
            }
        }
      } catch (err: any) {
        console.error(`Failed backtesting ${baseTicker}`, err.message);
      }
    }

    // Backend Transparency: Dump exact server memory payload so we know Vercel generated strings 
    const finalResults = db.prepare('SELECT * FROM backtests').all();
    console.log("BACKTEST RESULTS PAYLOAD:", JSON.stringify(finalResults, null, 2));

    return NextResponse.json({ success: true, signalsGenerated: totalSignals });
  } catch (err: any) {
    console.error('CRITICAL BACKTEST FAILURE:', err.message);
    const errorMsg = err instanceof Error ? err.message : String(err);
    const stackTrace = err instanceof Error ? err.stack : '';
    return NextResponse.json({ success: false, error: errorMsg, stack: stackTrace }, { status: 500 });
  }
}
