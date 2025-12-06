import { NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

interface HalachaRow {
  board_id: string;
  date: string;
  date_hebrew: string;
  context: string;
  part: string;
  chapter: string;
  halacha_id: string;
  title: string;
  summary: string;
  credit: string;
  url: string;
  halacha_key: string;
}

let halachaCache: HalachaRow[] | null = null;

function loadHalachot(): HalachaRow[] {
  if (halachaCache) {
    return halachaCache;
  }

  try {
    const csvPath = join(process.cwd(), 'data', 'halachot.csv');
    const fileContent = readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    }) as HalachaRow[];
    
    halachaCache = records;
    return records;
  } catch (error) {
    console.error('Error loading halachot CSV:', error);
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const date = dateParam || new Date().toISOString().slice(0, 10);

    const halachot = loadHalachot();
    const dateHalachot = halachot.filter(h => h.date === date);

    if (dateHalachot.length === 0) {
      return NextResponse.json({ 
        date, 
        date_hebrew: null, 
        items: [] 
      });
    }

    const dateHebrew = dateHalachot[0].date_hebrew;
    const items = dateHalachot.slice(0, 4).map(h => ({
      title: h.title,
      summary: h.summary,
      text: h.summary,
      content: h.summary,
      part: h.part,
      chapter: h.chapter,
      halacha_id: h.halacha_id,
      credit: h.credit,
      url: h.url,
      halacha_key: h.halacha_key
    }));

    return NextResponse.json({ 
      date, 
      date_hebrew: dateHebrew, 
      items 
    });
  } catch (e) {
    console.error('[HALACHA] Error fetching halacha:', e);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

