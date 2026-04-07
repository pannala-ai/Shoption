import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import yahooFinance from 'yahoo-finance2';

// Initialize with dummy key if undefined so build doesn't fail
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || messages.length === 0) {
      return NextResponse.json({ type: 'text', text: "I can't answer" });
    }

    const query = messages[messages.length - 1].content.trim();

    // 1. Intent & Ticker Extraction parsing
    const systemPrompt = `You are Orevix AI, an elite quantitative options terminal assistant.
Your job is to analyze stock/options questions.
If the query is NOT about financial markets, stocks, options, or companies, reply EXACTLY with standard JSON: {"error": "I can't answer"}
If the user asks about a specific company or stock ticker, reply with JSON: {"ticker": "TICKER_SYMBOL", "topic": "analysis overview"}
If it is a general market question without a specific stock, reply with JSON: {"topic": "question details"}
Ensure your output is strictly valid JSON format.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');

    if (parsed.error === "I can't answer") {
      return NextResponse.json({ type: 'text', text: "I can't answer" });
    }

    let validTicker: string | null = null;
    let quote: any = null;

    if (parsed.ticker) {
      try {
        quote = await yahooFinance.quote(parsed.ticker);
        if (quote && quote.regularMarketPrice) {
          validTicker = parsed.ticker.toUpperCase();
        } else {
           return NextResponse.json({ type: 'text', text: "Company doesn't exist" });
        }
      } catch (e) {
        return NextResponse.json({ type: 'text', text: "Company doesn't exist" });
      }
    }

    // 2. Deep rundown generation
    const contextStr = validTicker && quote 
      ? `Provide a concise 2-3 paragraph rundown on ${validTicker}. Current market context: Price $${quote.regularMarketPrice}, Volume: ${(quote.regularMarketVolume || 0).toLocaleString()}, Change: ${quote.regularMarketChangePercent?.toFixed(2)}%, PE Ratio: ${quote.trailingPE || 'N/A'}. Include technical volume flow and market sentiment in a professional, authoritative tone.`
      : `Provide a concise, professional 2-3 paragraph rundown answering this quantitative query: ${query}. Use an authoritative tone.`;

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Orevix AI. Provide a highly professional, 10th-grade level quantitative rundown. No robotic emojis. Use clear paragraphs." },
        { role: "user", content: contextStr }
      ]
    });

    const text = analysisResponse.choices[0].message.content || 'Analysis unavailable.';

    return NextResponse.json({
      type: validTicker ? 'chart' : 'text',
      ticker: validTicker,
      text
    });

  } catch (err: any) {
    if (err.message && err.message.includes('401')) {
       return NextResponse.json({ type: 'text', text: "System Error: OpenAI API Key is invalid or expired." });
    }
    console.error(err);
    return NextResponse.json({ type: 'text', text: "I can't answer" }, { status: 500 });
  }
}
