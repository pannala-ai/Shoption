// app/api/alerts/route.ts
// AI Alert synthesizer: triggers gpt-4o trade thesis when signal conditions met

import { NextRequest, NextResponse } from 'next/server';
import { generateTradeTThesis, scoreHeadlineSentiment } from '@/lib/openai-client';
import { shouldTriggerAlert, formatSynthesizerPrompt, SynthesizerPayload } from '@/lib/engine';
import { getOptionsChain } from '@/lib/polygon';

export async function POST(req: NextRequest) {
  try {
    const body: SynthesizerPayload = await req.json();

    // Check if alert conditions are met
    if (!shouldTriggerAlert(body)) {
      return NextResponse.json({ triggered: false, reason: 'Alert conditions not met' });
    }

    const prompt = formatSynthesizerPrompt(body);
    const thesis = await generateTradeTThesis(prompt);

    return NextResponse.json({
      triggered: true,
      ticker: body.ticker,
      thesis,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[alerts/POST]', err);
    return NextResponse.json({ error: 'AI synthesis failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Convert the generic stock ticker query into a pinpointed top-tier Options target
  const baseTicker = req.nextUrl.searchParams.get('ticker') ?? 'NVDA';

  try {
    // 1. Fetch the Options Chain dynamically to lock onto the correct external ticker string format
    const chainRes = await getOptionsChain(baseTicker.toUpperCase());
    
    // Strict Verification: Guard against 500 crashes if Polygon has no data or is rate limiting
    if (!chainRes || !Array.isArray(chainRes.results) || chainRes.results.length === 0) {
      return NextResponse.json([]);
    }
    
    // 2. Select the Absolute Highest Volume Contract as the institutional target
    const topContract = chainRes.results.sort((a, b) => (b.day?.volume || 0) - (a.day?.volume || 0))[0];
    const optionTicker = topContract.details.ticker; // Properly formatted: e.g., O:AAPL240119C00150000

    const price = topContract.day?.close ?? topContract.underlying_asset?.price ?? 0;
    const vwap = topContract.day?.vwap ?? price;
    
    // Emulate RVOL relative against physical Open Interest
    const contractVolume = topContract.day?.volume || 0;
    const contractOI = topContract.open_interest || Math.max(1, contractVolume / 2); // Default mock if 0
    const rvol = contractOI > 0 ? contractVolume / contractOI : 0;

    const payload: SynthesizerPayload = {
      ticker: optionTicker, // Pass the EXACT option format into the AI synthesizer to maintain Orevix rigidity
      price,
      vwap,
      rvol: parseFloat(rvol.toFixed(2)),
      otmCallVolumeSpike: topContract.details.contract_type === 'call' && rvol > 1.5,
      uoaDetected: rvol > 2.0, 
      gex: 0,
    };

    if (!shouldTriggerAlert(payload)) {
      return NextResponse.json({
        triggered: false,
        payload,
        reason: `RVOL ${rvol.toFixed(2)}x — not enough signal yet`,
      });
    }

    const prompt = formatSynthesizerPrompt(payload);
    const thesis = await generateTradeTThesis(prompt);

    return NextResponse.json({ triggered: true, ticker: optionTicker, payload, thesis, timestamp: Date.now() });
  } catch (err: any) {
    console.error('Polygon API Failed:', err.message || String(err));
    // Zero Frontend Errors Policy: Swallow the error and gracefully blank the UI layer
    return NextResponse.json([]);
  }
}

export async function PUT(req: NextRequest) {
  // Score a headline for sentiment
  try {
    const { headline } = await req.json();
    if (!headline) return NextResponse.json({ error: 'headline required' }, { status: 400 });
    const score = await scoreHeadlineSentiment(headline);
    return NextResponse.json({ headline, score, timestamp: Date.now() });
  } catch (err) {
    console.error('[alerts/PUT]', err);
    return NextResponse.json({ error: 'Sentiment scoring failed' }, { status: 500 });
  }
}

