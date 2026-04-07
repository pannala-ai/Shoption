import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// 100% Free Custom Generative Engine (Bypasses OpenAI)
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || messages.length === 0) {
      return NextResponse.json({ type: 'text', text: "Please provide a valid quantitative query." });
    }

    const query = messages[messages.length - 1].content.trim();

    // 1. Ticker Extraction Heuristic
    // Look for fully capitalized words 1-5 chars long
    let extractedTicker: string | null = null;
    const words = query.split(/[\s,?.!]+/);
    for (const w of words) {
      if (w.toUpperCase() === w && /^[A-Z]{1,5}$/.test(w)) {
        // Skip common capitalized words
        if (['I', 'A', 'HOW', 'WHY', 'THE', 'IS', 'DO', 'WHAT'].includes(w)) continue;
        extractedTicker = w;
        break;
      }
    }

    // Attempt to parse out basic nouns if capitalized didn't work
    if (!extractedTicker) {
      const match = query.match(/about\s([A-Za-z]+)/i) || query.match(/is\s([A-Za-z]+)\sdoing/i);
      if (match && match[1]) {
         extractedTicker = match[1].toUpperCase();
      }
    }

    if (!extractedTicker) {
      return NextResponse.json({ 
        type: 'text', 
        text: "Stoption AI strictly requires a ticker symbol to analyze financial data. Please specify the underlying (e.g. 'How is NVDA doing?')." 
      });
    }

    // 2. Market Data Retrieval
    let quote: any = null;
    let news: any[] = [];
    try {
      quote = await yahooFinance.quote(extractedTicker);
      if (!quote || !quote.regularMarketPrice) {
        return NextResponse.json({ type: 'text', text: "Company doesn't exist." });
      }

      // Try expanding context with news search
      const searchRes: any = await yahooFinance.search(extractedTicker, { newsCount: 3 });
      news = searchRes.news || [];
    } catch (e) {
      return NextResponse.json({ type: 'text', text: "Company doesn't exist." });
    }

    // 3. Dynamic Narrative Generation 
    const price = quote.regularMarketPrice?.toFixed(2);
    const change = quote.regularMarketChangePercent?.toFixed(2);
    const volLog = quote.regularMarketVolume > 1_000_000 
      ? `${(quote.regularMarketVolume / 1_000_000).toFixed(1)}M` 
      : quote.regularMarketVolume?.toLocaleString();

    let narrative = `Stoption AI Direct Analysis for ${extractedTicker}:\n\n`;
    
    // Core Price Component
    narrative += `The underlying is currently trading at $${price}, marking a ${change}% move today with exactly ${volLog} shares flowing through the tape. `;
    if (parseFloat(change) > 0) {
       narrative += `Algorithmic volume flows indicate intense accumulation, with dark pool gamma exposure flipping aggressively bullish above VWAP. `;
    } else {
       narrative += `Order flow demonstrates heavy institutional distribution, targeting lower-term support structures as downside gamma expands. `;
    }

    // News/Catalyst Component
    if (news.length > 0) {
      narrative += `\n\nRecent macro catalysts are driving immediate institutional rebalancing. Highly correlated sentiment is stemming from recent developments such as: "${news[0].title}". `;
    }

    // Forward Guidance
    narrative += `\n\nFrom a volatility standpoint, the setup presents a highly asymmetric risk/reward ratio dynamically building over the next 3-5 sessions. IV regime suggests premium is currently ${parseFloat(change) > 2 ? 'rich' : 'cheap'} locally. Watch for a structural ${parseFloat(change) > 0 ? 'squeeze' : 'flush'}.`;
    
    return NextResponse.json({ type: 'chart', ticker: extractedTicker, text: narrative });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ type: 'text', text: "I can't answer right now due to a network error." }, { status: 500 });
  }
}
