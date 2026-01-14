import { NextResponse } from 'next/server';
import { AppLogger } from '@/utils/AppLogger';

type BoardInfo = {
  linked: boolean;
  user_id?: number;
  name?: string;
  display_name?: string;
  displayName?: string;
  base_name?: string;
  base_description?: string | null;
  board_bid?: string;
  location?: string;
  logical_board_id?: number;
  prayers?: Array<{
    id: number;
    title: string;
    timeType: 'fixed' | 'relative';
    fixedTime?: string | null;
    relativeBase?: string | null;
    offsetMinutes?: number | null;
    dayOfWeek: 'weekday' | 'shabbat';
    background?: string;
    createdAt?: string;
  }>;
  updates?: Array<any>;
};

const API_BASE = 'https://shchakim.rabaz.co.il';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get('id');

  if (!boardId) {
    return NextResponse.json({ error: 'board id required' }, { status: 400 });
  }

  const targetUrl = `${API_BASE}/api/board-info?id=${encodeURIComponent(boardId)}`;
  AppLogger.info('[PROXY] Board-info GET: proxying request', { boardId, targetUrl });

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    AppLogger.info('[PROXY] Board-info GET: response received', {
      boardId,
      status: response.status
    });

    if (!response.ok) {
      const errorText = await response.text();
      AppLogger.warn('[PROXY] Board-info GET: error response', {
        boardId,
        status: response.status,
        error: errorText
      });
      return NextResponse.json({ linked: false }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache'
        }
      });
    }

    const data: BoardInfo = await response.json();
    AppLogger.info('[PROXY] Board-info GET: success response', {
      boardId,
      hasPrayers: !!data.prayers,
      hasUpdates: !!data.updates
    });
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    AppLogger.error('[PROXY] Board-info GET: error proxying request', {
      boardId,
      error
    });
    return NextResponse.json({ linked: false }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { board_id?: string; logical_board_id?: number; user_id?: number; name?: string } | null;

  if (!body?.board_id || !body?.logical_board_id || !body?.user_id) {
    return NextResponse.json({ error: 'board_id, logical_board_id and user_id required' }, { status: 400 });
  }

  const targetUrl = `${API_BASE}/api/board-info`;
  AppLogger.info('[PROXY] Board-info POST: proxying request', {
    targetUrl,
    body
  });

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    AppLogger.info('[PROXY] Board-info POST: response received', {
      status: response.status
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to claim board' }));
      AppLogger.warn('[PROXY] Board-info POST: error response', {
        status: response.status,
        error: errorData
      });
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    AppLogger.info('[PROXY] Board-info POST: success response', {
      status: response.status
    });
    return NextResponse.json(data);
  } catch (error) {
    AppLogger.error('[PROXY] Board-info POST: error proxying request', {
      error
    });
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
