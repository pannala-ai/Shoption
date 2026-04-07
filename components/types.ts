export interface BacktestRow {
  id: string;
  ticker: string;
  signal: 'BUY' | 'SELL';
  entryTime: number;
  entryDate: string;
  entryPrice: number;
  peakPrice: number;
  peakPremium: number;
  entryPremium: number;
  maxGainPct: number;
  hitTarget: number;
  strength: number;
  reason: string;
}

export interface AdvancedMetrics {
  stopLoss: number;
  takeProfit: number;
  winRate: number;
  rsi: number;
  macd: string;
  gex: string;
  darkPool: number;
  sectorRel: string;
  durationEst: string;
  riskGrade: 'A+'|'A'|'B'|'C'|'F';
  squeezeMeter: number;
  posSize: string;
  atr: number;
}

export interface ScanResult {
  ticker: string;
  price: number;
  change: number;
  changeDollar: number;
  volume: number;
  rvol: number;
  vwap: number;
  high: number;
  low: number;
  signal: 'BUY' | 'SELL' | 'NONE';
  signalStrength: number;
  reason: string;
  isAfterHours?: boolean;
  detectedAt?: string;
  assetType?: 'STOCK' | 'OPTION';
  strategyName?: string;
  strikeLabel?: string;
  proMetrics?: AdvancedMetrics;
  gexRegime?: 'PINNED' | 'NORMAL' | 'SQUEEZE';
  ivRegime?: 'IV_RICH' | 'FAIR' | 'IV_CHEAP';
  dealerBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  squeezeProbability?: number;
  ivZScore?: number;
}

export interface OptionsRow {
  id: string;
  ticker: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  isUnusual: boolean;
  premium: number;
  spot: number;
  isGenerated?: boolean;
  timestamp?: number;
}

export interface PastTrade {
  id: string;
  ticker: string;
  signal: 'BUY' | 'SELL';
  price: number;
  entryPrice?: number;
  reason: string;
  strength: number;
  time: string;
  date: string;
  timestamp: number;
  entryTime?: number;
  exitTime?: number;
  entryDate?: string;
  maxGainPct?: number;
  assetType?: 'STOCK' | 'OPTION';
  strategyName?: string;
  strikeLabel?: string;
}

export interface PinnedTrade extends PastTrade {
  pinnedAt: number;
  exitDate?: string;
  exitTimeStr?: string;
}
