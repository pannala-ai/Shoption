import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const rows = db.prepare('SELECT * FROM backtests ORDER BY entryTime DESC').all();
    return NextResponse.json({ success: true, backtests: rows });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Fetch backtest error', errorMsg);
    return NextResponse.json({ success: false, error: errorMsg, backtests: [] }, { status: 500 });
  }
}
