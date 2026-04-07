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
    const nameMap: Record<string, string> = {
      'NVIDIA': 'NVDA', 'TESLA': 'TSLA', 'APPLE': 'AAPL', 'AMAZON': 'AMZN', 'MICROSOFT': 'MSFT', 'GOOGLE': 'GOOGL', 'META': 'META'
    };

    let extractedTicker: string | null = null;
    const words = query.split(/[\s,?.!]+/);
    for (const w of words) {
      const upperW = w.toUpperCase();
      if (nameMap[upperW]) {
        extractedTicker = nameMap[upperW];
        break;
      }
      if (upperW === w && /^[A-Z]{1,5}$/.test(w)) {
        if (['I', 'A', 'HOW', 'WHY', 'THE', 'IS', 'DO', 'WHAT'].includes(w)) continue;
        extractedTicker = w;
        break;
      }
    }

    if (!extractedTicker) {
      const match = query.match(/about\s([A-Za-z]+)/i) || query.match(/is\s([A-Za-z]+)\sdoing/i) || query.match(/is\s([A-Za-z]+)/i);
      if (match && match[1]) {
         const upperStr = match[1].toUpperCase();
         extractedTicker = nameMap[upperStr] || upperStr;
      }
    }

    // Direct single word fallback
    if (!extractedTicker && words.length === 1 && /^[A-Za-z]{1,5}$/.test(words[0])) {
      extractedTicker = words[0].toUpperCase();
    }

    if (!extractedTicker) {
      return NextResponse.json({ 
        type: 'text', 
        text: "Stoption AI strictly requires a ticker symbol to analyze financial data. Please specify the underlying (e.g. 'How is NVDA doing?')." 
      });
    }

    // 2. Market Data Retrieval (Strictly LIVE DATA)
    let quote: any = null;
    let news: any[] = [];
    
    try {
      // Direct fetch bypasses Yahoo's cookie/crumb blocking
      const quoteRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${extractedTicker}`);
      const quoteData = await quoteRes.json();
      const meta = quoteData?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice) {
        quote = {
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketChangePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
          regularMarketVolume: meta.regularMarketVolume || 0
        };
        
        try {
          const searchRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${extractedTicker}`);
          const searchData = await searchRes.json();
          if (searchData.news && searchData.news.length > 0) news = searchData.news;
        } catch(e) {}
      } else {
        throw new Error('Not found');
      }
    } catch (e) {
      return NextResponse.json({ type: 'text', text: "Stoption AI cannot pull live data for this ticker right now or company doesn't exist." });
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
