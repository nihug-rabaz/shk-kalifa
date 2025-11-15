import { NextResponse } from 'next/server';

const API_BASE = 'https://shchakim.rabaz.co.il';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { board_id?: string; logical_board_id?: number } | null;

  if (!body?.board_id || !body?.logical_board_id) {
    return NextResponse.json({ error: 'board_id and logical_board_id required' }, { status: 400 });
  }

  const targetUrl = `${API_BASE}/api/claim`;
  console.log(`[PROXY] Claim POST: proxying request to ${targetUrl}`, JSON.stringify(body));

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    console.log(`[PROXY] Claim POST: response status ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to claim board' }));
      console.log(`[PROXY] Claim POST: error response:`, JSON.stringify(errorData));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    console.log(`[PROXY] Claim POST: success response:`, JSON.stringify(data));
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[PROXY] Claim POST: error proxying request:`, error);
    return NextResponse.json({ error: 'Failed to process claim request' }, { status: 500 });
  }
}
