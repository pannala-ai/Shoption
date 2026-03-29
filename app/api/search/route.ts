// app/api/search/route.ts
// Ticker search endpoint

import { NextRequest, NextResponse } from 'next/server';
import { searchTickers } from '@/lib/polygon';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? '';
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await searchTickers(query);
    return NextResponse.json({ results: data.results ?? [] });
  } catch (err) {
    console.error('[search]', err);
    return NextResponse.json({ error: 'Search failed', results: [] }, { status: 500 });
  }
}
