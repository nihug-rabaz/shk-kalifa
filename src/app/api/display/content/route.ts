import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

const API_BASE = 'https://shchakim.rabaz.co.il';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get('boardId');

  if (!boardId) {
    return NextResponse.json({ error: 'boardId required' }, { status: 400 });
  }

  try {
    // נסה קודם /api/board-info
    const boardInfoUrl = `${API_BASE}/api/board-info?id=${encodeURIComponent(boardId)}`;
    console.log(`[PROXY] Display-content: proxying to ${boardInfoUrl}`);

    const boardInfoResponse = await fetch(boardInfoUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    let boardInfo: any = null;
    if (boardInfoResponse.ok) {
      boardInfo = await boardInfoResponse.json();
      console.log(`[PROXY] Display-content: received board info for ${boardId}`);
      console.log(`[PROXY] Display-content: boardInfo.unit_logo:`, boardInfo.unit_logo);
      console.log(`[PROXY] Display-content: boardInfo.synagogue_id:`, (boardInfo as any).synagogue_id, 'Type:', typeof (boardInfo as any).synagogue_id);
      console.log(`[PROXY] Display-content: boardInfo.synagogueId:`, (boardInfo as any).synagogueId, 'Type:', typeof (boardInfo as any).synagogueId);
    } else {
      console.log(`[PROXY] Display-content: board-info error status ${boardInfoResponse.status}, will try to use externalContent`);
    }

    // נסה /api/display/content כ-fallback
    const displayContentUrl = `${API_BASE}/api/display/content?boardId=${encodeURIComponent(boardId)}`;
    console.log(`[PROXY] Display-content: trying fallback ${displayContentUrl}`);

    const displayContentResponse = await fetch(displayContentUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    let externalContent = null;
    if (displayContentResponse.ok) {
      externalContent = await displayContentResponse.json();
      console.log(`[PROXY] Display-content: received external display content for ${boardId}`);
      console.log(`[PROXY] Display-content: externalContent.boardInfo?.synagogue_id:`, externalContent?.boardInfo?.synagogue_id, 'Type:', typeof externalContent?.boardInfo?.synagogue_id);
      console.log(`[PROXY] Display-content: externalContent.boardInfo?.synagogueId:`, externalContent?.boardInfo?.synagogueId, 'Type:', typeof externalContent?.boardInfo?.synagogueId);
      console.log(`[PROXY] Display-content: externalContent.fab:`, externalContent?.fab);

      // אם board-info נכשל, נשתמש ב-externalContent
      if (!boardInfo && externalContent?.boardInfo) {
        boardInfo = {
          linked: true,
          prayers: externalContent.prayers || [],
          updates: externalContent.updates || [],
          letter: externalContent.letter || null,
          theme: externalContent.theme || externalContent.boardInfo?.theme,
          ...externalContent.boardInfo
        };
        console.log(`[PROXY] Display-content: Using boardInfo from externalContent`);
      }
    } else {
      console.log(`[PROXY] Display-content: display-content error status ${displayContentResponse.status}`);
    }

    // אם גם board-info וגם display-content נכשלו
    if (!boardInfo) {
      return NextResponse.json({ error: 'Failed to fetch board info' }, { status: 500 });
    }

    // בדוק אם הלוח מחובר
    const isLinked = boardInfo.linked === true || 
                     boardInfo.linked === 'true' || 
                     (boardInfo.logical_board_id && boardInfo.logical_board_id > 0) ||
                     (externalContent?.boardInfo && externalContent.boardInfo.linked !== false);

    if (!isLinked) {
      return NextResponse.json({ error: 'Board not linked' }, { status: 404 });
    }

    const themePrimary = boardInfo?.theme?.primaryHex || boardInfo.themeColor || '#0b3d2e';
    const themeGradient = Array.isArray(boardInfo?.theme?.gradient)
      ? boardInfo.theme.gradient
      : [themePrimary, '#145a43'];

    // קח synagogue_id גם מ-externalContent
    const synagogueId = (() => {
      const id = externalContent?.boardInfo?.synagogue_id ||
                 externalContent?.boardInfo?.synagogueId ||
                 (boardInfo as any).synagogue_id ||
                 (boardInfo as any).synagogueId;
      console.log(`[PROXY] Display-content: Setting synagogueId in payload:`, id, 'Type:', typeof id);
      return (id !== null && id !== undefined && id !== false && id !== '') ? id : null;
    })();

    // טען את אגרת הרבצר מהקובץ אם אין letter מה-API
    let rabbanutLetter = boardInfo.letter || externalContent?.letter || null;
    if (!rabbanutLetter) {
      try {
        const letterPath = join(process.cwd(), 'data', 'rabbanut-letter.txt');
        rabbanutLetter = await readFile(letterPath, 'utf-8');
      } catch (error) {
        console.warn('[PROXY] Display-content: Could not load rabbanut letter file:', error);
      }
    }

    const payload = {
      boardId: boardInfo.board_bid || boardId,
      prayers: boardInfo.prayers || [],
      updates: boardInfo.updates || [],
      letter: rabbanutLetter,
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
        synagogue_id: synagogueId,
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

