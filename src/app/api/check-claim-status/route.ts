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
      AppLogger.info('[CHECK-CLAIM] board-info response OK, checking for letter', {
        board_id,
        hasLetter: !!boardInfoData.letter,
        hasHtml: !!boardInfoData.html
      });
      
      if (boardInfoData.letter) {
        responseData.letter = boardInfoData.letter;
        AppLogger.info('[CHECK-CLAIM] Added letter to response', {
          board_id,
          type: typeof boardInfoData.letter
        });
      } else if (boardInfoData.html) {
        responseData.letter = {
          html: boardInfoData.html,
          id: boardInfoData.letterId || null,
          title: boardInfoData.letterTitle || null,
          parasha: boardInfoData.parasha || null,
          signature: boardInfoData.signature || null,
          updatedAt: boardInfoData.letterUpdatedAt || null
        };
        AppLogger.info('[CHECK-CLAIM] Created letter object from html field', { board_id });
      }
      if (boardInfoData.html && !boardInfoData.letter) {
        responseData.html = boardInfoData.html;
        AppLogger.info('[CHECK-CLAIM] Added html to response', { board_id });
      }
      return NextResponse.json(responseData);
    }

    // אם board-info נכשל, נסה /api/display/content כ-fallback
    AppLogger.warn('[CHECK-CLAIM] board-info failed, trying display/content as fallback', {
      board_id,
      status: boardInfoResponse.status
    });
    
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
        AppLogger.info('[CHECK-CLAIM] Using display/content as fallback - board is linked', {
          board_id
        });
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
    AppLogger.warn('[CHECK-CLAIM] Both APIs failed, returning linked: false', { board_id });
    return NextResponse.json(
      {
        linked: false,
        logical_board_id: 0,
        error: boardInfoData?.error || 'Failed to fetch board info',
      },
      { status: 200 }
    );
  } catch (error) {
    AppLogger.error('Check claim status API error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

