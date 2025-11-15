import { NextResponse } from 'next/server';

const API_BASE = 'https://shchakim.rabaz.co.il';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get('boardId');

  if (!boardId) {
    return NextResponse.json({ error: 'boardId required' }, { status: 400 });
  }

  try {
    const targetUrl = `${API_BASE}/api/board-info?id=${encodeURIComponent(boardId)}`;
    console.log(`[PROXY] Display-content: proxying to ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.log(`[PROXY] Display-content: error status ${response.status}`);
      return NextResponse.json({ error: 'Failed to fetch board info' }, { status: response.status });
    }

    const boardInfo = await response.json();
    console.log(`[PROXY] Display-content: received board info for ${boardId}`);

    if (!boardInfo.linked) {
      return NextResponse.json({ error: 'Board not linked' }, { status: 404 });
    }

    const themePrimary = boardInfo?.theme?.primaryHex || boardInfo.themeColor || '#0b3d2e';
    const themeGradient = Array.isArray(boardInfo?.theme?.gradient)
      ? boardInfo.theme.gradient
      : [themePrimary, '#145a43'];

    const payload = {
      boardId: boardInfo.board_bid || boardId,
      prayers: boardInfo.prayers || [],
      updates: boardInfo.updates || [],
      letter: boardInfo.letter || null,
      halacha: null,
      orders: boardInfo.orders || [],
      durations: boardInfo.durations || {},
      additions: { prayerExtras: { shacharit: [], mincha: [], arvit: [] }, dayNotes: [] },
      assets: boardInfo.assets || [],
      lastUpdatedAt: new Date().toISOString(),
      boardInfo: {
        name: boardInfo.name,
        display_name: boardInfo.display_name || boardInfo.displayName || null,
        base_name: boardInfo.base_name,
        base_description: boardInfo.base_description,
        location: boardInfo.location,
        user_id: boardInfo.user_id,
        theme: { primaryHex: themePrimary, gradient: themeGradient }
      },
      theme: { primaryHex: themePrimary, gradient: themeGradient },
      background: { type: 'gradient', colors: themeGradient }
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    console.error('[PROXY] Display-content: error proxying request:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

