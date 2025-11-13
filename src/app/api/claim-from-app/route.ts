import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'https://shchakim.rabaz.co.il/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { board_id, logical_board_id } = body;

    if (!board_id || !logical_board_id) {
      return NextResponse.json(
        { error: 'Missing required fields: board_id and logical_board_id' },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board_id,
        logical_board_id,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Claim request failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Claim from app API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

