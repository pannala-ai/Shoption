'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface SearchResult {
  ticker: string;
  name: string;
  primary_exchange: string;
  type: string;
}

interface TickerSearchProps {
  onSelect: (ticker: string) => void;
}

const POPULAR = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'AMZN', 'MSFT', 'META', 'GOOGL', 'SPY', 'QQQ', 'PLTR', 'MSTR', 'COIN', 'SMCI', 'ARM'];

export default function TickerSearch({ onSelect }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const handleSelect = (ticker: string) => {
    onSelect(ticker);
    setQuery('');
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-1 px-2 py-1 search-input w-full">
        <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search ticker... (AAPL, TSLA...)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent outline-none text-xs mono text-zinc-200"
          style={{ minWidth: 0 }}
        />
        {loading && <div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin flex-shrink-0" />}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 z-50 rounded mt-1 overflow-hidden shadow-2xl"
          style={{ background: '#111', border: '1px solid #27272a', maxHeight: '280px', overflowY: 'auto' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Popular tickers (when no query) */}
          {!query && (
            <>
              <div className="px-3 py-1.5 text-[9px] mono text-zinc-700 uppercase tracking-widest border-b" style={{ borderColor: '#27272a' }}>
                Popular
              </div>
              <div className="flex flex-wrap gap-1 p-2">
                {POPULAR.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleSelect(t)}
                    className="px-2 py-0.5 rounded text-[9px] mono font-semibold transition-colors"
                    style={{
                      background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.2)',
                      color: '#a78bfa',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Search results */}
          {query && results.length === 0 && !loading && (
            <div className="px-3 py-3 text-[10px] mono text-zinc-600 text-center">
              No tickers found for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => handleSelect(r.ticker)}
              className="w-full flex items-center gap-3 px-3 py-2 transition-colors text-left"
              style={{
                background: 'transparent',
                borderBottom: '1px solid rgba(39,39,42,0.5)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span className="mono font-bold text-xs text-white w-16 flex-shrink-0">{r.ticker}</span>
              <span className="text-[10px] text-zinc-500 flex-1 truncate" style={{ fontFamily: 'Inter' }}>{r.name}</span>
              <span className="text-[9px] mono text-zinc-700 flex-shrink-0">{r.primary_exchange}</span>
            </button>
          ))}
        </div>
      )}

      {/* Click-outside overlay */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
