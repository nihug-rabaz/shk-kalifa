import { NextRequest, NextResponse } from 'next/server';
import { getPurimRange } from '@/utils/PurimRange';

function parseYYYYMMDD(s: string): Date | null {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function dateInRange(date: Date, start: string, end: string): boolean {
  const d = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  return d >= start && d <= end;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const refDate = dateParam ? parseYYYYMMDD(dateParam) : new Date();
  if (dateParam && !refDate) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD' }, { status: 400 });
  }
  const ref = refDate || new Date();
  const range = getPurimRange(ref);
  const inRange = dateInRange(ref, range.start, range.end);
  return NextResponse.json({ ...range, inRange });
}
