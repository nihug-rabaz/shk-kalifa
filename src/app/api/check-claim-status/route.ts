import { NextRequest, NextResponse } from 'next/server';

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

    // נסה קודם /api/board-info
    const boardInfoResponse = await fetch(`${API_BASE_URL}/board-info?id=${board_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const boardInfoData = await boardInfoResponse.json();

    if (boardInfoResponse.ok) {
      const responseData: any = { ...boardInfoData };
      console.log('[CHECK-CLAIM] board-info response OK, checking for letter...');
      console.log('[CHECK-CLAIM] boardInfoData.letter exists:', !!boardInfoData.letter);
      console.log('[CHECK-CLAIM] boardInfoData.html exists:', !!boardInfoData.html);
      
      if (boardInfoData.letter) {
        responseData.letter = boardInfoData.letter;
        console.log('[CHECK-CLAIM] ✅ Added letter to response, type:', typeof boardInfoData.letter);
        if (typeof boardInfoData.letter === 'object') {
          console.log('[CHECK-CLAIM] Letter object keys:', Object.keys(boardInfoData.letter));
          console.log('[CHECK-CLAIM] Letter title:', boardInfoData.letter.title, 'parasha:', boardInfoData.letter.parasha);
        }
      } else if (boardInfoData.html) {
        responseData.letter = {
          html: boardInfoData.html,
          id: boardInfoData.letterId || null,
          title: boardInfoData.letterTitle || null,
          parasha: boardInfoData.parasha || null,
          signature: boardInfoData.signature || null,
          updatedAt: boardInfoData.letterUpdatedAt || null
        };
        console.log('[CHECK-CLAIM] ✅ Created letter object from html field');
      }
      if (boardInfoData.html && !boardInfoData.letter) {
        responseData.html = boardInfoData.html;
        console.log('[CHECK-CLAIM] ✅ Added html to response');
      }
      return NextResponse.json(responseData);
    }

    // אם board-info נכשל, נסה /api/display/content כ-fallback
    console.log(`[CHECK-CLAIM] board-info failed (${boardInfoResponse.status}), trying display/content as fallback`);
    
    const displayContentResponse = await fetch(`${API_BASE_URL}/display/content?boardId=${board_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (displayContentResponse.ok) {
      const displayContentData = await displayContentResponse.json();
      
      // אם יש boardInfo ב-display/content, הלוח משויך
      if (displayContentData?.boardInfo) {
        console.log(`[CHECK-CLAIM] Using display/content as fallback - board is linked`);
        const responseData: any = {
          linked: true,
          logical_board_id: displayContentData.boardInfo.logical_board_id || 1,
          user_id: displayContentData.boardInfo.user_id,
          name: displayContentData.boardInfo.display_name || displayContentData.boardInfo.name,
          display_name: displayContentData.boardInfo.display_name,
          base_name: displayContentData.boardInfo.base_name,
          location: displayContentData.boardInfo.location,
          synagogue_id: displayContentData.boardInfo.synagogue_id,
          theme: displayContentData.boardInfo.theme,
          board_bid: displayContentData.boardId,
        };
        if (displayContentData.letter) {
          responseData.letter = displayContentData.letter;
        }
        if (displayContentData.html) {
          responseData.html = displayContentData.html;
        }
        return NextResponse.json(responseData);
      }
    }

    // אם גם display/content נכשל או לא החזיר boardInfo, הלוח לא משויך
    console.log(`[CHECK-CLAIM] Both APIs failed, returning linked: false`);
    return NextResponse.json(
      {
        linked: false,
        logical_board_id: 0,
        error: boardInfoData?.error || 'Failed to fetch board info',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Check claim status API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

