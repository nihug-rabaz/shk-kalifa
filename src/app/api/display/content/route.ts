import { NextResponse } from 'next/server';
import { AppLogger } from '@/utils/AppLogger';

const API_BASE = 'https://shchakim.rabaz.co.il';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get('boardId');

  if (!boardId) {
    return NextResponse.json({ error: 'boardId required' }, { status: 400 });
  }

  try {
    const boardInfoUrl = `${API_BASE}/api/board-info?id=${encodeURIComponent(boardId)}`;
    AppLogger.info('[PROXY] Display-content: proxying to board-info', { boardId, boardInfoUrl });

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
      AppLogger.info('[PROXY] Display-content: received board info', {
        boardId,
        unit_logo: boardInfo.unit_logo,
        synagogue_id: (boardInfo as any).synagogue_id,
        synagogueId: (boardInfo as any).synagogueId
      });
    } else {
      AppLogger.warn('[PROXY] Display-content: board-info error, will try externalContent', {
        boardId,
        status: boardInfoResponse.status
      });
    }

    const displayContentUrl = `${API_BASE}/api/display/content?boardId=${encodeURIComponent(boardId)}`;
    AppLogger.info('[PROXY] Display-content: trying display/content fallback', {
      boardId,
      displayContentUrl
    });

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
      AppLogger.info('[PROXY] Display-content: received external display content', {
        boardId,
        hasBoardInfo: !!externalContent?.boardInfo,
        hasFab: !!externalContent?.fab
      });

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
        AppLogger.info('[PROXY] Display-content: Using boardInfo from externalContent', { boardId });
      }
    } else {
      AppLogger.warn('[PROXY] Display-content: display-content error status', {
        boardId,
        status: displayContentResponse.status
      });
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

    const synagogueId = (() => {
      const id = externalContent?.boardInfo?.synagogue_id ||
                 externalContent?.boardInfo?.synagogueId ||
                 (boardInfo as any).synagogue_id ||
                 (boardInfo as any).synagogueId;
      AppLogger.info('[PROXY] Display-content: Setting synagogueId in payload', {
        boardId,
        synagogueId: id
      });
      return (id !== null && id !== undefined && id !== false && id !== '') ? id : null;
    })();

    let rabbanutLetter = null;
    try {
      const requestUrl = new URL(req.url);
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const checkClaimUrl = `${baseUrl}/api/check-claim-status?board_id=${encodeURIComponent(boardId)}`;
      AppLogger.info('[PROXY] Display-content: Fetching letter from check-claim-status', {
        boardId,
        checkClaimUrl
      });
      
      const checkClaimResponse = await fetch(checkClaimUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      });
      
      AppLogger.info('[PROXY] Display-content: check-claim-status response status', {
        boardId,
        status: checkClaimResponse.status
      });
      
      if (checkClaimResponse.ok) {
        const checkClaimData = await checkClaimResponse.json();
        console.log('[PROXY] Display-content: check-claim-status data keys:', Object.keys(checkClaimData));
        console.log('[PROXY] Display-content: check-claim-status has letter:', !!checkClaimData.letter);
        console.log('[PROXY] Display-content: check-claim-status has html:', !!checkClaimData.html);
        
        if (checkClaimData.letter) {
          rabbanutLetter = checkClaimData.letter;
          AppLogger.info('[PROXY] Display-content: Loaded rabbanut letter from check-claim-status', {
            boardId,
            type: typeof rabbanutLetter
          });
        } else if (checkClaimData.html) {
          rabbanutLetter = {
            html: checkClaimData.html,
            id: checkClaimData.letterId || null,
            title: checkClaimData.letterTitle || null,
            parasha: checkClaimData.parasha || null,
            signature: checkClaimData.signature || null,
            updatedAt: checkClaimData.letterUpdatedAt || null
          };
          AppLogger.info('[PROXY] Display-content: Created letter object from html field in check-claim-status', {
            boardId
          });
        } else {
          AppLogger.warn('[PROXY] Display-content: No letter or html in check-claim-status response', {
            boardId
          });
        }
      } else {
        AppLogger.warn('[PROXY] Display-content: check-claim-status response not OK', {
          boardId,
          status: checkClaimResponse.status
        });
      }
    } catch (error) {
      AppLogger.error('[PROXY] Display-content: Error fetching letter from check-claim-status', {
        boardId,
        error
      });
    }
    
    if (!rabbanutLetter) {
      rabbanutLetter = boardInfo.letter || externalContent?.letter || null;
      if (rabbanutLetter) {
        if (typeof rabbanutLetter === 'object' && rabbanutLetter.html) {
          AppLogger.info('[PROXY] Display-content: Loaded rabbanut letter object from fallback', {
            boardId,
            title: rabbanutLetter.title,
            parasha: rabbanutLetter.parasha
          });
        } else if (typeof rabbanutLetter === 'string') {
          AppLogger.info('[PROXY] Display-content: Loaded rabbanut letter string from fallback', {
            boardId,
            length: rabbanutLetter.length
          });
        } else {
          AppLogger.info('[PROXY] Display-content: Loaded rabbanut letter from fallback (unknown type)', {
            boardId
          });
        }
      } else {
        AppLogger.info('[PROXY] Display-content: No rabbanut letter found in any source', {
          boardId
        });
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

