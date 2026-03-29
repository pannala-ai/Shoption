// app/api/alerts/route.ts
// AI Alert synthesizer: triggers gpt-4o trade thesis when signal conditions met

import { NextRequest, NextResponse } from 'next/server';
import { generateTradeTThesis, scoreHeadlineSentiment } from '@/lib/openai-client';
import { shouldTriggerAlert, formatSynthesizerPrompt, SynthesizerPayload } from '@/lib/engine';
import { getSnapshot } from '@/lib/polygon';

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
  // Demo: generate alert for a ticker passed as query param
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'NVDA';

  try {
    const snapshot = await getSnapshot(ticker.toUpperCase());
    const t = snapshot.ticker;

    if (!t) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    const price = t.lastTrade?.p ?? t.day?.c ?? 0;
    const vwap = t.day?.vw ?? price;
    const minutesElapsed = getMinutesIntoTradingDay();
    const prevDayMinuteVol = t.prevDay?.v ? t.prevDay.v / 390 : 1;
    const currentMinuteVol = t.day?.v ? t.day.v / Math.max(1, minutesElapsed) : 0;
    const rvol = prevDayMinuteVol > 0 ? currentMinuteVol / prevDayMinuteVol : 0;

    const payload: SynthesizerPayload = {
      ticker: ticker.toUpperCase(),
      price,
      vwap,
      rvol: parseFloat(rvol.toFixed(2)),
      otmCallVolumeSpike: rvol > 2.5, // simplified proxy
      uoaDetected: false,
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

    return NextResponse.json({ triggered: true, ticker, payload, thesis, timestamp: Date.now() });
  } catch (err) {
    console.error('[alerts/GET]', err);
    return NextResponse.json({ error: 'Failed to generate alert' }, { status: 500 });
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

function getMinutesIntoTradingDay(): number {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30;
  return Math.max(1, totalMinutes - marketOpen);
}
