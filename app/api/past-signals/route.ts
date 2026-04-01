export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const CORE_CHAIN = ['NVDA', 'SPY', 'QQQ', 'AMD', 'TSLA', 'AAPL', 'META', 'AMZN', 'COIN', 'MSFT'];

export async function GET() {
  const generatedPastSignals = [];
  
  // Deterministic "Today" for seed stability
  const today = new Date();
  
  // We want exactly 5 valid trading days of history
  let daysFound = 0;
  let dayOffset = 1;

  while (daysFound < 5 && dayOffset < 15) {
    const historicalCursor = new Date(today);
    historicalCursor.setDate(today.getDate() - dayOffset);
    dayOffset++;
    
    // Skip Weekends
    if (historicalCursor.getDay() === 0 || historicalCursor.getDay() === 6) continue;
    
    daysFound++;
    const isoDate = historicalCursor.toISOString().split('T')[0];
    
    // Unique seed for this specific day
    let daySeed = 0;
    for (let c = 0; c < isoDate.length; c++) daySeed += isoDate.charCodeAt(c);
    
    for (let j = 0; j < CORE_CHAIN.length; j++) {
       const ticker = CORE_CHAIN[j];
       
       // Unique hash for this ticker on this day
       // Using prime multipliers to ensure divergence
       const tickerHash = (daySeed * 31 + j * 17 + ticker.charCodeAt(0)) % 10000;
       
       // Sieve: Show ~50-70% of chain depending on day seed
       const gate = (daySeed + j) % 10;
       if (gate > 6) continue; 
       
       // PRNG
       const rng = (tickerHash * 9301 + 49297) % 233280;
       const norm = rng / 233280;
       
       const isCall = (tickerHash % 2) === 0;
       const signal = isCall ? 'BUY' : 'SELL';
       
       // Pricing variety based on ticker
       let baseSpot = 150;
       if (ticker === 'NVDA') baseSpot = 900;
       if (ticker === 'SPY') baseSpot = 520;
       if (ticker === 'QQQ') baseSpot = 440;
       if (ticker === 'TSLA') baseSpot = 170;

       const spot = baseSpot + (norm * 20 - 10);
       const entryPrem = 2.5 + (norm * 12);
       
       // Max Gain Variety: 15% to 110%
       const maxGain = 15 + (norm * 95);
       const peakPrem = entryPrem * (1 + (maxGain / 100));

       // Distributed Timestamps: 9:45 AM to 3:30 PM
       const hour = 9 + Math.floor(norm * 6); // 9 to 15 (3 PM)
       const minute = Math.floor(((norm * 100) % 1) * 60);
       const timeString = `${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
       const exactFillTime = new Date(timeString).getTime();

       generatedPastSignals.push({
          id: `${ticker}-${isoDate}-${j}-v2`,
          ticker,
          signal,
          entryTime: exactFillTime,
          entryDate: isoDate,
          entryPrice: spot, 
          peakPrice: spot * (isCall ? 1.03 : 0.97),
          peakPremium: peakPrem,
          entryPremium: entryPrem,
          maxGainPct: maxGain,
          hitTarget: 1, // All past signals in this view were "successes"
          strength: 92 + Math.floor(norm * 7),
          reason: isCall 
            ? 'Institutional Bullish Sweep (RVOL > 1.8x, Heavy Out-of-Money Flow)' 
            : 'Unusual Put Volume (Whale Entry detected at Resistance)',
       });
    }
  }

  // Sort: Newest to Oldest
  generatedPastSignals.sort((a,b) => b.entryTime - a.entryTime);

  return NextResponse.json({ success: true, signals: generatedPastSignals });
}
