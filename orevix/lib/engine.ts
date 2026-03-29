// lib/engine.ts
// Orevix Core Math Engine — VWAP, RVOL, UOA, GEX, Black-Scholes Greeks

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VWAPResult {
  vwap: number;
  upper1: number;
  upper2: number;
  upper3: number;
  lower1: number;
  lower2: number;
  lower3: number;
}

/**
 * Calculates intraday VWAP and ±1/2/3 Standard Deviation bands.
 * Formula: VWAP = Σ(typical_price × volume) / Σ(volume)
 */
export function calculateVWAP(candles: Candle[]): VWAPResult {
  if (!candles.length) return { vwap: 0, upper1: 0, upper2: 0, upper3: 0, lower1: 0, lower2: 0, lower3: 0 };

  let cumPV = 0;
  let cumVol = 0;
  const typicalPrices: number[] = [];

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumVol += c.volume;
    typicalPrices.push(tp);
  }

  const vwap = cumVol > 0 ? cumPV / cumVol : 0;

  // Population variance of typical prices
  const meanTP = typicalPrices.reduce((a, b) => a + b, 0) / typicalPrices.length;
  const variance = typicalPrices.reduce((sum, tp) => sum + Math.pow(tp - meanTP, 2), 0) / typicalPrices.length;
  const sigma = Math.sqrt(variance);

  return {
    vwap,
    upper1: vwap + sigma,
    upper2: vwap + 2 * sigma,
    upper3: vwap + 3 * sigma,
    lower1: vwap - sigma,
    lower2: vwap - 2 * sigma,
    lower3: vwap - 3 * sigma,
  };
}

export interface RunningVWAPPoint {
  time: number;
  vwap: number;
  upper1: number;
  upper2: number;
  lower1: number;
  lower2: number;
}

/**
 * Calculates running (per-bar) VWAP with standard deviation bands.
 * Each bar's VWAP is the cumulative VWAP up to that point.
 * Sigma is the volume-weighted standard deviation of typical prices.
 */
export function calculateRunningVWAP(candles: Candle[]): RunningVWAPPoint[] {
  if (!candles.length) return [];

  const result: RunningVWAPPoint[] = [];
  let cumPV = 0;
  let cumVol = 0;
  let cumPV2 = 0; // Σ(tp² × vol) for variance

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumVol += c.volume;
    cumPV2 += tp * tp * c.volume;

    const vwap = cumVol > 0 ? cumPV / cumVol : tp;
    // Volume-weighted variance: Σ(tp² × vol)/Σ(vol) - vwap²
    const variance = cumVol > 0 ? Math.max(0, cumPV2 / cumVol - vwap * vwap) : 0;
    const sigma = Math.sqrt(variance);

    result.push({
      time: c.time,
      vwap,
      upper1: vwap + sigma,
      upper2: vwap + 2 * sigma,
      lower1: vwap - sigma,
      lower2: vwap - 2 * sigma,
    });
  }

  return result;
}

/**
 * Relative Volume (RVOL): current cumulative volume vs. 10-day historical
 * average volume at this exact minute of the day.
 * @param currentVolume - cumulative intraday volume so far
 * @param historicalAvgByMinute - 10-day avg volume up to this same minute
 */
export function calculateRVOL(currentVolume: number, historicalAvgByMinute: number): number {
  if (historicalAvgByMinute <= 0) return 0;
  return parseFloat((currentVolume / historicalAvgByMinute).toFixed(2));
}

export interface OptionsStrike {
  strike: number;
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  callGamma: number;
  putGamma: number;
  spotPrice: number;
}

export interface UOAResult {
  isUnusual: boolean;
  callVolumeVsOI: number;
  putVolumeVsOI: number;
}

/**
 * Unusual Options Activity (UOA): flags when trade volume > open interest
 */
export function detectUOA(strike: OptionsStrike): UOAResult {
  const callRatio = strike.callOI > 0 ? strike.callVolume / strike.callOI : 0;
  const putRatio = strike.putOI > 0 ? strike.putVolume / strike.putOI : 0;
  return {
    isUnusual: callRatio > 1 || putRatio > 1,
    callVolumeVsOI: parseFloat(callRatio.toFixed(2)),
    putVolumeVsOI: parseFloat(putRatio.toFixed(2)),
  };
}

/**
 * Net Gamma Exposure (GEX): estimates dealer hedging wall.
 * GEX = Σ [ (callGamma - putGamma) × OI × 100 × spot² ]
 * Negative GEX = dealers short gamma → amplifies moves.
 * Positive GEX = dealers long gamma → dampens moves.
 */
export function calculateGEX(strikes: OptionsStrike[]): number {
  let totalGEX = 0;
  const spot = strikes[0]?.spotPrice ?? 0;

  for (const s of strikes) {
    const callGEX = s.callGamma * s.callOI * 100 * spot * spot;
    const putGEX = s.putGamma * s.putOI * 100 * spot * spot;
    totalGEX += callGEX - putGEX;
  }

  return parseFloat(totalGEX.toFixed(2));
}

// ─── Black-Scholes Greeks ─────────────────────────────────────────────────────

/** Standard normal distribution CDF approximation (Abramowitz & Stegun) */
function normCDF(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Standard normal distribution PDF */
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BSMGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  iv: number;
}

/**
 * Black-Scholes-Merton Greeks for European options.
 * @param S - spot price
 * @param K - strike price
 * @param T - time to expiry in years
 * @param r - risk-free rate (e.g. 0.05)
 * @param sigma - implied volatility (e.g. 0.25)
 * @param optionType - 'call' | 'put'
 */
export function calculateBSMGreeks(
  S: number, K: number, T: number, r: number, sigma: number, optionType: 'call' | 'put'
): BSMGreeks {
  if (T <= 0 || S <= 0 || K <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, iv: sigma };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1 = normCDF(d1);
  const nd2 = normCDF(d2);
  const nd1neg = normCDF(-d1);
  const nd2neg = normCDF(-d2);
  const pdfD1 = normPDF(d1);

  const delta = optionType === 'call' ? nd1 : nd1 - 1;
  const gamma = pdfD1 / (S * sigma * sqrtT);
  const vega = S * pdfD1 * sqrtT / 100; // per 1% move in IV
  const theta = optionType === 'call'
    ? (-(S * pdfD1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * nd2) / 365
    : (-(S * pdfD1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * nd2neg) / 365;
  const rho = optionType === 'call'
    ? K * T * Math.exp(-r * T) * nd2 / 100
    : -K * T * Math.exp(-r * T) * nd2neg / 100;

  return {
    delta: parseFloat(delta.toFixed(4)),
    gamma: parseFloat(gamma.toFixed(6)),
    theta: parseFloat(theta.toFixed(4)),
    vega:  parseFloat(vega.toFixed(4)),
    rho:   parseFloat(rho.toFixed(4)),
    iv:    sigma,
  };
}

// ─── AI Synthesizer Trigger ───────────────────────────────────────────────────

export interface SynthesizerPayload {
  ticker: string;
  price: number;
  vwap: number;
  rvol: number;
  otmCallVolumeSpike: boolean;
  uoaDetected: boolean;
  gex: number;
  sentiment?: number;
}

/**
 * Determines whether conditions are met to trigger an AI trade thesis alert.
 * Rule: RVOL > 3.0 AND price crosses VWAP AND OTM call volume spikes
 */
export function shouldTriggerAlert(payload: SynthesizerPayload): boolean {
  const priceCrossedVWAP = Math.abs(payload.price - payload.vwap) / payload.vwap < 0.002; // within 0.2%
  return payload.rvol > 3.0 && priceCrossedVWAP && payload.otmCallVolumeSpike;
}

export function formatSynthesizerPrompt(payload: SynthesizerPayload): string {
  return `You are a quantitative trading analyst. Analyze this real-time trade setup and return a JSON alert.

TICKER: ${payload.ticker}
PRICE: $${payload.price.toFixed(2)}
VWAP: $${payload.vwap.toFixed(2)} (price is ${payload.price > payload.vwap ? 'ABOVE' : 'BELOW'} VWAP)
RVOL: ${payload.rvol}x (${payload.rvol > 3 ? 'EXTREMELY HIGH' : 'elevated'} relative volume)
OTM CALL VOLUME SPIKE: ${payload.otmCallVolumeSpike ? 'YES — unusual call buying detected' : 'No'}
UOA DETECTED: ${payload.uoaDetected ? 'YES — volume exceeds open interest' : 'No'}
NET GEX: $${(payload.gex / 1e9).toFixed(2)}B (${payload.gex > 0 ? 'positive — dealers dampen moves' : 'negative — dealers amplify moves'})
SENTIMENT SCORE: ${payload.sentiment?.toFixed(2) ?? 'N/A'} (-1 bearish → +1 bullish)

Return ONLY valid JSON in this exact structure:
{
  "ticker": "${payload.ticker}",
  "setup": "one of: Bullish Breakout | Bearish Breakdown | Squeeze Setup | Unusual Flow | Momentum Continuation",
  "thesis": "2-3 sentence institutional-quality trade thesis explaining why this setup is high probability",
  "entry": "suggested entry price or range",
  "target": "price target",
  "stop": "stop loss level",
  "confidence": "HIGH | MEDIUM | LOW",
  "risk_reward": "e.g. 1:3",
  "timeframe": "e.g. Intraday | Swing (2-5 days)"
}`;
}
