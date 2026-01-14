import { NextRequest, NextResponse } from 'next/server';
import { AppLogger } from '@/utils/AppLogger';

const API_BASE_URL = 'https://shchakim.rabaz.co.il/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const board_id = searchParams.get('board_id');

    if (!board_id) {
      return NextResponse.json(
        { error: 'Missing board_id parameter' },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/board-info?id=${board_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch board data' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    AppLogger.error('Board data API error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

