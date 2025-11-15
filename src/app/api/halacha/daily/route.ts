import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const date = dateParam || new Date().toISOString().slice(0, 10);

    const upstream = await fetch('https://2halachot.rabaz.co.il/api/daily', {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'accept-language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://2halachot.rabaz.co.il/',
        'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
      }
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Failed to fetch halacha' }, { status: upstream.status });
    }

    const data = await upstream.json();
    // Normalize shape
    const items = Array.isArray(data?.items) ? data.items.slice(0, 4) : [];
    return NextResponse.json({ date: data?.date || date, date_hebrew: data?.date_hebrew, items });
  } catch (e) {
    console.error('[PROXY] Halacha daily: error fetching halacha:', e);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

