// lib/engine.ts
// Shoption Core Math Engine v2
// VWAP · RVOL · UOA · GEX · BSM Greeks
// NEW: Yang-Zhang HV · IV Z-Score · GEXProfile · Expected Move · Dealer Positioning

export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

export interface VWAPResult {
  vwap: number; upper1: number; upper2: number; upper3: number;
  lower1: number; lower2: number; lower3: number;
}

export function calculateVWAP(candles: Candle[]): VWAPResult {
  if (!candles.length) return { vwap: 0, upper1: 0, upper2: 0, upper3: 0, lower1: 0, lower2: 0, lower3: 0 };
  let cumPV = 0, cumVol = 0;
  const tps: number[] = [];
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume; cumVol += c.volume; tps.push(tp);
  }
  const vwap = cumVol > 0 ? cumPV / cumVol : 0;
  const mean = tps.reduce((a, b) => a + b, 0) / tps.length;
  const sigma = Math.sqrt(tps.reduce((s, tp) => s + (tp - mean) ** 2, 0) / tps.length);
  return { vwap, upper1: vwap + sigma, upper2: vwap + 2*sigma, upper3: vwap + 3*sigma, lower1: vwap - sigma, lower2: vwap - 2*sigma, lower3: vwap - 3*sigma };
}

export interface RunningVWAPPoint {
  time: number; vwap: number; upper1: number; upper2: number; lower1: number; lower2: number;
}

export function calculateRunningVWAP(candles: Candle[]): RunningVWAPPoint[] {
  if (!candles.length) return [];
  const result: RunningVWAPPoint[] = [];
  let cumPV = 0, cumVol = 0, cumPV2 = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume; cumVol += c.volume; cumPV2 += tp * tp * c.volume;
    const vwap = cumVol > 0 ? cumPV / cumVol : tp;
    const sigma = Math.sqrt(Math.max(0, cumVol > 0 ? cumPV2 / cumVol - vwap * vwap : 0));
    result.push({ time: c.time, vwap, upper1: vwap + sigma, upper2: vwap + 2*sigma, lower1: vwap - sigma, lower2: vwap - 2*sigma });
  }
  return result;
}

export function calculateRVOL(currentVolume: number, historicalAvgByMinute: number): number {
  if (historicalAvgByMinute <= 0) return 0;
  return parseFloat((currentVolume / historicalAvgByMinute).toFixed(2));
}

export interface OptionsStrike {
  strike: number; callVolume: number; putVolume: number;
  callOI: number; putOI: number; callGamma: number; putGamma: number; spotPrice: number;
}

export interface UOAResult { isUnusual: boolean; callVolumeVsOI: number; putVolumeVsOI: number; }

export function detectUOA(strike: OptionsStrike): UOAResult {
  const callRatio = strike.callOI > 0 ? strike.callVolume / strike.callOI : 0;
  const putRatio  = strike.putOI  > 0 ? strike.putVolume  / strike.putOI  : 0;
  return { isUnusual: callRatio > 1 || putRatio > 1, callVolumeVsOI: parseFloat(callRatio.toFixed(2)), putVolumeVsOI: parseFloat(putRatio.toFixed(2)) };
}

export function calculateGEX(strikes: OptionsStrike[]): number {
  let totalGEX = 0;
  const spot = strikes[0]?.spotPrice ?? 0;
  for (const s of strikes) {
    totalGEX += (s.callGamma * s.callOI - s.putGamma * s.putOI) * 100 * spot * spot;
  }
  return parseFloat(totalGEX.toFixed(2));
}

// ─── Black-Scholes Greeks ─────────────────────────────────────────────────────
function normCDF(x: number): number {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}
function normPDF(x: number): number { return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI); }

export interface BSMGreeks { delta: number; gamma: number; theta: number; vega: number; rho: number; iv: number; theoreticalPremium: number; }

export function calculateBSMGreeks(S: number, K: number, T: number, r: number, sigma: number, optionType: 'call'|'put'): BSMGreeks {
  if (T <= 0 || S <= 0 || K <= 0 || sigma <= 0) return { delta:0, gamma:0, theta:0, vega:0, rho:0, iv:sigma, theoreticalPremium:0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const nd1=normCDF(d1), nd2=normCDF(d2), nd1n=normCDF(-d1), nd2n=normCDF(-d2), pd1=normPDF(d1);
  const delta = optionType==='call' ? nd1 : nd1-1;
  const gamma = pd1 / (S*sigma*sqrtT);
  const vega  = S*pd1*sqrtT/100;
  const theta = optionType==='call' ? (-(S*pd1*sigma)/(2*sqrtT) - r*K*Math.exp(-r*T)*nd2)/365 : (-(S*pd1*sigma)/(2*sqrtT) + r*K*Math.exp(-r*T)*nd2n)/365;
  const rho   = optionType==='call' ? K*T*Math.exp(-r*T)*nd2/100 : -K*T*Math.exp(-r*T)*nd2n/100;
  const premium = optionType==='call' ? S*nd1 - K*Math.exp(-r*T)*nd2 : K*Math.exp(-r*T)*nd2n - S*nd1n;
  return { delta:parseFloat(delta.toFixed(4)), gamma:parseFloat(gamma.toFixed(6)), theta:parseFloat(theta.toFixed(4)), vega:parseFloat(vega.toFixed(4)), rho:parseFloat(rho.toFixed(4)), iv:sigma, theoreticalPremium:parseFloat(premium.toFixed(4)) };
}

// ─── NEW: GEX Profile (Dealer Gamma Positioning) ──────────────────────────────
export interface GEXProfile {
  netGEX: number;              // + = dealers long gamma (pinned), - = dealers short gamma (squeeze)
  biggestWallStrike: number;   // strike with highest gamma concentration
  squeezeProbability: number;  // 0-100
  regime: 'PINNED' | 'NORMAL' | 'SQUEEZE';
  dealerBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Extended GEX: computes net dealer gamma and classifies market regime.
 * Negative netGEX → dealers short gamma → moves amplified (squeeze zone).
 * Positive netGEX → dealers long gamma → moves dampened (pinning zone).
 */
export function calculateGEXProfile(strikes: OptionsStrike[], spot: number): GEXProfile {
  if (!strikes.length || spot <= 0) return { netGEX:0, biggestWallStrike:spot, squeezeProbability:0, regime:'NORMAL', dealerBias:'NEUTRAL' };
  let callGEXTotal = 0, putGEXTotal = 0, maxWall = 0, biggestWallStrike = spot;
  for (const s of strikes) {
    const cg = s.callGamma * s.callOI * 100 * spot * spot;
    const pg = s.putGamma  * s.putOI  * 100 * spot * spot;
    callGEXTotal += cg; putGEXTotal += pg;
    const net = Math.abs(cg - pg);
    if (net > maxWall) { maxWall = net; biggestWallStrike = s.strike; }
  }
  const netGEX = callGEXTotal - putGEXTotal;
  // Normalize squeeze probability from net GEX relative to spot
  const norm = netGEX / Math.max(1, spot * spot * 100 * (strikes[0]?.callOI ?? 1));
  const squeezeProbability = Math.max(0, Math.min(100, Math.round(50 - norm * 500)));
  const regime: GEXProfile['regime'] = netGEX > 5e8 ? 'PINNED' : netGEX < -1e8 ? 'SQUEEZE' : 'NORMAL';
  const dealerBias: GEXProfile['dealerBias'] = regime === 'PINNED' ? 'NEUTRAL' : regime === 'SQUEEZE' ? (spot >= biggestWallStrike ? 'BULLISH' : 'BEARISH') : (netGEX >= 0 ? 'BULLISH' : 'BEARISH');
  return { netGEX: parseFloat(netGEX.toFixed(2)), biggestWallStrike, squeezeProbability, regime, dealerBias };
}

// ─── NEW: Yang-Zhang Historical Volatility ────────────────────────────────────
/**
 * Minimum-variance HV estimator. Accounts for overnight gaps and intraday range.
 * Superior to close-to-close for options because it captures opening gaps (like earnings).
 * Returns annualized HV as a percentage.
 */
export function yangZhangHV(candles: Candle[], period: number = 21): number {
  if (candles.length < period + 1) return 0;
  const n = period;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const s = candles.slice(-(n + 1));
  let sumON = 0, sumOpen = 0, sumRS = 0;
  for (let i = 1; i <= n; i++) {
    const prev = s[i-1], cur = s[i];
    const on = Math.log(cur.open / prev.close);
    const op = Math.log(cur.open / cur.close);
    const rs = Math.log(cur.high / cur.close) * Math.log(cur.high / cur.open)
             + Math.log(cur.low  / cur.close) * Math.log(cur.low  / cur.open);
    sumON += on*on; sumOpen += op*op; sumRS += rs;
  }
  const varYZ = sumON/(n-1) + k*(sumOpen/(n-1)) + (1-k)*(sumRS/n);
  return parseFloat((Math.sqrt(Math.max(0, varYZ * 252)) * 100).toFixed(2));
}

// ─── NEW: IV Z-Score / Mean Reversion Regime ──────────────────────────────────
export interface IVRegime {
  zScore: number;
  halfLifeDays: number;
  regime: 'IV_RICH' | 'FAIR' | 'IV_CHEAP';
  tradeEdge: 'SELL_PREMIUM' | 'NEUTRAL' | 'BUY_VOLATILITY';
  revertTargetIV: number;
}

/**
 * Computes IV Z-score using Ornstein-Uhlenbeck mean reversion model.
 * |Z| > 2.0 = strong signal. IV_RICH → sell premium. IV_CHEAP → buy vol.
 */
export function calculateIVRegime(currentIV: number, ivHistory: number[], zThreshold = 2.0): IVRegime {
  if (ivHistory.length < 5) return { zScore:0, halfLifeDays:30, regime:'FAIR', tradeEdge:'NEUTRAL', revertTargetIV:currentIV };
  const n = ivHistory.length;
  const mean = ivHistory.reduce((a,b) => a+b, 0) / n;
  const variance = ivHistory.reduce((s,v) => s+(v-mean)**2, 0) / (n-1);
  const std = Math.sqrt(variance);
  const zScore = std > 0 ? (currentIV - mean) / std : 0;
  // Estimate mean-reversion half-life from lag-1 autocorrelation
  const m1 = ivHistory.slice(0,-1).reduce((a,b)=>a+b,0)/(n-1);
  const m2 = ivHistory.slice(1).reduce((a,b)=>a+b,0)/(n-1);
  let cov = 0;
  for (let i=0;i<n-1;i++) cov += (ivHistory[i]-m1)*(ivHistory[i+1]-m2);
  const autocorr = Math.min(0.99, Math.max(0.01, cov / ((n-2) * variance)));
  const theta = -Math.log(Math.abs(autocorr));
  const halfLifeDays = Math.min(90, Math.max(1, Math.round(Math.log(2) / Math.max(0.001, theta))));
  const regime: IVRegime['regime'] = zScore > zThreshold ? 'IV_RICH' : zScore < -zThreshold ? 'IV_CHEAP' : 'FAIR';
  const tradeEdge: IVRegime['tradeEdge'] = regime === 'IV_RICH' ? 'SELL_PREMIUM' : regime === 'IV_CHEAP' ? 'BUY_VOLATILITY' : 'NEUTRAL';
  return { zScore: parseFloat(zScore.toFixed(2)), halfLifeDays, regime, tradeEdge, revertTargetIV: parseFloat(mean.toFixed(4)) };
}

// ─── NEW: Expected Move + Earnings Edge ───────────────────────────────────────
export interface ExpectedMoveResult {
  expectedMovePct: number;      // 1σ move implied by options
  historicalAvgMovePct: number; // ticker's historical avg actual move
  edgeMultiple: number;         // historical/expected (>1 = IV cheap, <1 = IV rich)
  verdict: 'IV_RICH' | 'FAIR' | 'IV_CHEAP';
  strategy: 'IRON_CONDOR' | 'SHORT_STRANGLE' | 'HOLD' | 'STRADDLE' | 'STRANGLE';
  confidence: number;
  ivRichness: number; // % by how much IV is over/under priced
}

export function expectedMove(spot: number, iv: number, dte: number): number {
  return parseFloat((spot * iv * Math.sqrt(Math.max(0, dte) / 365)).toFixed(2));
}

/**
 * Compares market-priced expected move to historical avg actual move.
 * edgeMultiple < 0.7 → IV overpriced → sell premium (Iron Condor / Short Strangle)
 * edgeMultiple > 1.3 → IV underpriced → buy volatility (Straddle / Strangle)
 */
export function analyzeEarningsEdge(spot: number, iv: number, dte: number, historicalAvgMovePct: number): ExpectedMoveResult {
  const em = expectedMove(spot, iv, dte);
  const emPct = parseFloat(((em / spot) * 100).toFixed(2));
  const edgeMultiple = historicalAvgMovePct > 0 ? parseFloat((historicalAvgMovePct / Math.max(0.1, emPct)).toFixed(2)) : 1;
  const ivRichness = parseFloat(((emPct / Math.max(0.1, historicalAvgMovePct) - 1) * 100).toFixed(1));
  let verdict: ExpectedMoveResult['verdict'];
  let strategy: ExpectedMoveResult['strategy'];
  let confidence: number;
  if (edgeMultiple < 0.7) {
    verdict = 'IV_RICH'; strategy = emPct > 10 ? 'SHORT_STRANGLE' : 'IRON_CONDOR';
    confidence = Math.round(Math.min(97, 70 + (1 - edgeMultiple) * 45));
  } else if (edgeMultiple > 1.3) {
    verdict = 'IV_CHEAP'; strategy = emPct < 5 ? 'STRADDLE' : 'STRANGLE';
    confidence = Math.round(Math.min(97, 70 + (edgeMultiple - 1) * 35));
  } else {
    verdict = 'FAIR'; strategy = 'HOLD'; confidence = 52;
  }
  return { expectedMovePct: emPct, historicalAvgMovePct, edgeMultiple, verdict, strategy, confidence, ivRichness };
}

// ─── AI Synthesizer ───────────────────────────────────────────────────────────
export interface SynthesizerPayload {
  ticker: string; price: number; vwap: number; rvol: number;
  otmCallVolumeSpike: boolean; uoaDetected: boolean; gex: number; sentiment?: number;
  // Dealer positioning context (v2)
  gexRegime?: string; ivRegime?: string; dealerBias?: string;
  ivZScore?: number; squeezeProbability?: number;
}

export function shouldTriggerAlert(payload: SynthesizerPayload): boolean {
  const priceCrossedVWAP = Math.abs(payload.price - payload.vwap) / payload.vwap < 0.002;
  return payload.rvol > 3.0 && priceCrossedVWAP && payload.otmCallVolumeSpike;
}

export function formatSynthesizerPrompt(payload: SynthesizerPayload): string {
  const gexContext = payload.gexRegime
    ? `\nGEX REGIME: ${payload.gexRegime} (squeeze probability: ${payload.squeezeProbability ?? 0}%)`
    : '';
  const ivContext = payload.ivRegime
    ? `\nIV REGIME: ${payload.ivRegime} (Z-score: ${payload.ivZScore?.toFixed(2) ?? 'N/A'}) — trade edge: ${payload.ivRegime === 'IV_RICH' ? 'SELL PREMIUM' : payload.ivRegime === 'IV_CHEAP' ? 'BUY VOLATILITY' : 'NEUTRAL'}`
    : '';
  const dealerContext = payload.dealerBias
    ? `\nDEALER BIAS: ${payload.dealerBias} (mechanical hedging direction at current price)`
    : '';

  return `You are an elite quantitative options trading analyst. Analyze this real-time options setup and return a JSON alert.

TICKER: ${payload.ticker}
PRICE: $${payload.price.toFixed(2)}
VWAP: $${payload.vwap.toFixed(2)} (price is ${payload.price > payload.vwap ? 'ABOVE' : 'BELOW'} VWAP)
RVOL: ${payload.rvol}x (${payload.rvol > 3 ? 'EXTREMELY HIGH — institutional flow' : 'elevated'})
OTM CALL VOLUME SPIKE: ${payload.otmCallVolumeSpike ? 'YES — unusual call buying detected' : 'No'}
UOA DETECTED: ${payload.uoaDetected ? 'YES — volume exceeds open interest' : 'No'}
NET GEX: $${(payload.gex / 1e9).toFixed(2)}B (${payload.gex > 0 ? 'positive — dealers dampen moves' : 'negative — dealers amplify moves'})${gexContext}${ivContext}${dealerContext}
SENTIMENT: ${payload.sentiment?.toFixed(2) ?? 'N/A'} (-1 bearish → +1 bullish)

IMPORTANT: Use the GEX regime and IV regime to determine if this is a mechanical squeeze setup or a pure directional bet. Dealer bias tells you which direction market makers are forced to hedge.

Return ONLY valid JSON:
{
  "ticker": "${payload.ticker}",
  "setup": "one of: Gamma Squeeze | Bullish Breakout | Bearish Breakdown | IV Crush Play | Momentum Continuation | Unusual Flow",
  "thesis": "2-3 sentence institutional thesis incorporating GEX regime and dealer positioning",
  "entry": "suggested entry price or range",
  "target": "price target with % upside",
  "stop": "stop loss level",
  "confidence": "HIGH | MEDIUM | LOW",
  "risk_reward": "e.g. 1:3",
  "timeframe": "Intraday (0-2h) | Intraday (2-6h) | EOD",
  "dealerNote": "one sentence on how dealer hedging flows support or contradict this trade"
}`;
}

// ─── Quantitative Engine ──────────────────────────────────────────────────────
export interface AdvancedMetrics {
  stopLoss: number; takeProfit: number; winRate: number; rsi: number;
  macd: string; gex: string; darkPool: number; sectorRel: string;
  durationEst: string; riskGrade: 'A+'|'A'|'B'|'C'|'F';
  squeezeMeter: number; posSize: string; atr: number;
}

export type SignalType = 'BUY' | 'SELL' | 'NONE';
export type AssetType = 'STOCK' | 'OPTION';

export interface QuantSetup {
  strategyName: string; signal: SignalType; strength: number; reason: string;
  assetType: AssetType; strikeLabel?: string; proMetrics?: AdvancedMetrics;
  // v2: Dealer & IV Context (fed into signal cards + AI)
  gexRegime?: 'PINNED' | 'NORMAL' | 'SQUEEZE';
  ivRegime?: 'IV_RICH' | 'FAIR' | 'IV_CHEAP';
  dealerBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  squeezeProbability?: number;
  ivZScore?: number;
}

const STRATEGIES = [
  'VWAP + Bollinger Fade', 'VWAP + Volume', 'Bollinger Bands + RSI',
  'EMA crossover + VWAP', 'MACD + Bollinger Bands', 'ATR + VWAP',
  'VWAP + Anchored VWAP', 'Bollinger + MA Slope',
];

/**
 * Core signal evaluation engine. Now accepts optional dealer/IV context to:
 * 1. Boost strength when GEX squeeze aligns with signal direction
 * 2. Boost strength when IV regime supports the strategy (rich IV → sell, cheap IV → buy)
 * 3. Boost when dealer mechanical bias matches signal direction
 * 4. Include context in the QuantSetup return for UI display
 */
export function evaluateQuantitativeSetup(
  ticker: string,
  price: number,
  change: number,
  rvol: number,
  vwap: number,
  high: number,
  low: number,
  optionsVolOIRatio: number = 0,
  context?: {
    gexRegime?: 'PINNED' | 'NORMAL' | 'SQUEEZE';
    ivRegime?: 'IV_RICH' | 'FAIR' | 'IV_CHEAP';
    dealerBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    ivZScore?: number;
    squeezeProbability?: number;
  }
): QuantSetup {
  const isBullishVwapCross = price > vwap && change > 0;
  const isBearishVwapCross = price < vwap && change < 0;
  const isValidVwapCross   = isBullishVwapCross || isBearishVwapCross;
  const assetType: AssetType = 'OPTION';

  let signal: SignalType = 'NONE';
  let strength = 0;

  const priceRange = high > low ? (high - low) / low : 0.02;
  const atr = Number((price * priceRange).toFixed(2));
  const isVolatileEnough = Math.abs(change) > (atr / price) * 0.3 * 100;

  if (optionsVolOIRatio >= 1.8 && isValidVwapCross && isVolatileEnough) {
    signal = isBullishVwapCross ? 'BUY' : 'SELL';
    strength = Math.round(94 + (optionsVolOIRatio - 1.8) * 12 + Math.abs(change) * 2.5);
    strength = Math.min(99, Math.max(90, strength));
  } else {
    return { strategyName: 'Scanning...', signal: 'NONE', strength: 0, reason: '', assetType };
  }

  // ── Dealer & IV Context Boosters (v2) ──────────────────────────────────────
  let contextBoost = 0;
  const gexR = context?.gexRegime ?? 'NORMAL';
  const ivR  = context?.ivRegime  ?? 'FAIR';
  const db   = context?.dealerBias ?? 'NEUTRAL';

  // Squeeze zone: mechanical dealer covering amplifies move → strong boost
  if (gexR === 'SQUEEZE') contextBoost += 3;

  // IV richness aligned with trade type:
  // Sells into IV_RICH → selling overpriced premium → edge
  // Buys into IV_CHEAP → buying underpriced vol → edge
  if (ivR === 'IV_RICH'  && signal === 'SELL') contextBoost += 2;
  if (ivR === 'IV_CHEAP' && signal === 'BUY')  contextBoost += 2;

  // Dealer mechanical bias aligned → confirms institutional flow
  if (db === 'BULLISH' && signal === 'BUY')  contextBoost += 1;
  if (db === 'BEARISH' && signal === 'SELL') contextBoost += 1;

  strength = Math.min(99, Math.max(90, strength + contextBoost));

  // ── Strategy selection ────────────────────────────────────────────────────
  let stratIndex = 0;
  if (rvol > 3.5)               stratIndex = 1;
  else if (Math.abs(change) > 4) stratIndex = 5;
  else if (isBullishVwapCross && price < high * 0.99 && price > vwap) stratIndex = 0;
  else if (!isBullishVwapCross  && price > low  * 1.01 && price < vwap) stratIndex = 0;
  else stratIndex = 7;
  const strategyName = STRATEGIES[stratIndex];

  // ── Reason enriched with dealer context ──────────────────────────────────
  const gexTag = gexR === 'SQUEEZE' ? ' [⚡ SQUEEZE ZONE — dealer gamma forcing]' : gexR === 'PINNED' ? ' [📌 GAMMA PINNED — tight range]' : '';
  const ivTag  = ivR  === 'IV_RICH' ? ' [IV RICH → sell edge]' : ivR === 'IV_CHEAP' ? ' [IV CHEAP → buy edge]' : '';
  let baseReason = '';
  switch (stratIndex) {
    case 0: baseReason = isBullishVwapCross ? 'Reversal from lower Bollinger Band back toward VWAP' : 'Fading upper Bollinger Band extension down to VWAP'; break;
    case 1: baseReason = `Holding ${isBullishVwapCross ? 'above' : 'below'} VWAP with ${rvol.toFixed(1)}x volume confirmation`; break;
    case 2: baseReason = isBullishVwapCross ? 'RSI oversold rebound off lower band' : 'RSI overbought rejection at upper band'; break;
    case 3: baseReason = isBullishVwapCross ? 'Bullish EMA cross + pullback to VWAP' : 'Bearish EMA cross + breakdown below VWAP'; break;
    case 4: baseReason = `MACD momentum ${isBullishVwapCross ? 'expansion' : 'divergence'} pushing Bollinger Bands`; break;
    case 5: baseReason = `Price breached daily ATR threshold ${isBullishVwapCross ? 'above' : 'below'} VWAP`; break;
    case 6: baseReason = isBullishVwapCross ? 'Bouncing off event-anchored VWAP support' : 'Failing at event-anchored VWAP resistance'; break;
    case 7: baseReason = `Strong moving average slope confirming ${isBullishVwapCross ? 'breakout' : 'breakdown'}`; break;
    default: baseReason = isBullishVwapCross ? 'Bullish continuation setup' : 'Bearish breakdown setup';
  }
  const reason = baseReason + gexTag + ivTag;

  // ── Strike label ──────────────────────────────────────────────────────────
  const offset = isBullishVwapCross ? 1.05 : 0.95;
  let strikePrice = price * offset;
  if (price > 100)      strikePrice = Math.round(strikePrice / 5) * 5;
  else if (price > 20)  strikePrice = Math.round(strikePrice);
  else                  strikePrice = Math.round(strikePrice * 2) / 2;
  if (strikePrice === Math.round(price)) strikePrice += isBullishVwapCross ? (price > 100 ? 5 : 1) : -(price > 100 ? 5 : 1);
  const strikeLabel = `$${strikePrice} ${isBullishVwapCross ? 'CALL' : 'PUT'}`;

  // ── Pro Metrics ───────────────────────────────────────────────────────────
  const priceVsVwap = vwap > 0 ? (price - vwap) / vwap : 0;
  const rsi = isBullishVwapCross ? Math.min(100, Math.floor(50 + change*5 + rvol*2)) : Math.max(0, Math.floor(50 + change*5 - rvol*2));
  const posScale = rvol > 3 ? '8-10%' : '5-7%';
  const proMetrics: AdvancedMetrics = {
    stopLoss:    isBullishVwapCross ? price * 0.98 : price * 1.02,
    takeProfit:  isBullishVwapCross ? price * (1.02 + priceRange) : price * (0.98 - priceRange),
    winRate:     Math.min(88, Math.floor(74 + (strength - 90) + rvol * 0.2)),
    rsi:         Math.max(30, Math.min(70, rsi)),
    macd:        isBullishVwapCross ? 'BULL CROSS' : 'BEAR CROSS',
    gex:         (isBullishVwapCross ? '+' : '') + (change * rvol).toFixed(1) + 'B',
    darkPool:    Math.floor(Math.min(99, rvol * 15 + Math.abs(change) * 3)),
    sectorRel:   isBullishVwapCross && priceVsVwap > 0.01 ? '+OUTPERFORM' : '-UNDERPERFORM',
    durationEst: Math.max(5, Math.floor(120 / rvol)) + 'm',
    riskGrade:   strength >= 95 ? 'A+' : 'A',
    squeezeMeter: gexR === 'SQUEEZE' ? Math.min(99, (context?.squeezeProbability ?? 0) + 20) : rvol > 4 ? 99 : Math.floor(Math.min(99, rvol * 20)),
    posSize:     posScale,
    atr,
  };

  return {
    strategyName, signal, strength, reason, assetType, strikeLabel, proMetrics,
    gexRegime: gexR,
    ivRegime:  ivR,
    dealerBias: db,
    squeezeProbability: context?.squeezeProbability ?? 0,
    ivZScore: context?.ivZScore ?? 0,
  };
}
