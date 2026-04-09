export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const signals = db.prepare('SELECT * FROM signals').all();
    return NextResponse.json({ success: true, signals });
  } catch (err) {
    console.error('[past-signals]', err);
    return NextResponse.json({ success: false, signals: [] });
  }
}
