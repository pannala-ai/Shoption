// lib/polygon.ts
// Polygon.io REST API client for Orevix

const BASE = 'https://api.polygon.io';
const KEY = process.env.POLYGON_API_KEY!;

async function polygonFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apiKey', KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Polygon ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Get real-time snapshot for a ticker */
export async function getSnapshot(ticker: string) {
  return polygonFetch<PolygonSnapshotResponse>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
}

/** Get snapshots for multiple tickers (movers) */
export async function getSnapshots(tickers: string[]) {
  return polygonFetch<PolygonSnapshotsResponse>(`/v2/snapshot/locale/us/markets/stocks/tickers`, {
    tickers: tickers.join(','),
  });
}

/** Get top gainers/losers by percent change */
export async function getGainersLosers(direction: 'gainers' | 'losers') {
  return polygonFetch<PolygonSnapshotsResponse>(`/v2/snapshot/locale/us/markets/stocks/${direction}`);
}

/** Get options chain for a ticker */
export async function getOptionsChain(ticker: string, expirationDate?: string) {
  const params: Record<string, string | number> = {
    underlying_asset: ticker,
    limit: 50,
    order: 'desc',
    sort: 'volume',
  };
  if (expirationDate) params['expiration_date'] = expirationDate;
  return polygonFetch<PolygonOptionsChainResponse>(`/v3/snapshot/options/${ticker}`, params);
}

/** Get aggregated OHLCV bars for a ticker */
export async function getAggBars(
  ticker: string,
  multiplier: number = 1,
  timespan: string = 'minute',
  from: string,
  to: string
) {
  return polygonFetch<PolygonAggsResponse>(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, {
    adjusted: 'true',
    sort: 'asc',
    limit: 390,
  });
}

/** Get previous day OHLCV for computing historical average */
export async function getPreviousClose(ticker: string) {
  return polygonFetch<PolygonAggsResponse>(`/v2/aggs/ticker/${ticker}/prev`, { adjusted: 'true' });
}

/** Search tickers */
export async function searchTickers(query: string) {
  return polygonFetch<PolygonTickerSearchResponse>(`/v3/reference/tickers`, {
    search: query,
    active: 'true',
    limit: 10,
    market: 'stocks',
  });
}

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface PolygonSnapshotTicker {
  ticker: string;
  todaysChangePerc: number;
  todaysChange: number;
  updated: number;
  day: { o: number; h: number; l: number; c: number; v: number; vw: number };
  min: { av: number; o: number; h: number; l: number; c: number; v: number; vw: number };
  prevDay: { o: number; h: number; l: number; c: number; v: number; vw: number };
  lastTrade: { p: number; s: number; t: number };
  lastQuote: { P: number; S: number; p: number; s: number };
}

export interface PolygonSnapshotResponse {
  ticker: PolygonSnapshotTicker;
  status: string;
}

export interface PolygonSnapshotsResponse {
  tickers: PolygonSnapshotTicker[];
  status: string;
}

export interface PolygonOptionsContract {
  break_even_price: number;
  day: { close: number; high: number; last_updated: number; low: number; open: number; volume: number; vwap: number };
  details: {
    contract_type: 'call' | 'put';
    exercise_style: string;
    expiration_date: string;
    shares_per_contract: number;
    strike_price: number;
    ticker: string;
  };
  greeks: { delta: number; gamma: number; theta: number; vega: number };
  implied_volatility: number;
  open_interest: number;
  underlying_asset: { change_to_break_even: number; last_updated: number; price: number; ticker: string; timeframe: string };
}

export interface PolygonOptionsChainResponse {
  results: PolygonOptionsContract[];
  status: string;
  next_url?: string;
}

export interface PolygonAggsResult {
  v: number; vw: number; o: number; c: number; h: number; l: number; t: number; n: number;
}

export interface PolygonAggsResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonAggsResult[];
  status: string;
}

export interface PolygonTickerSearchResponse {
  results: Array<{
    ticker: string;
    name: string;
    market: string;
    locale: string;
    primary_exchange: string;
    type: string;
    active: boolean;
    currency_name: string;
  }>;
  status: string;
}
