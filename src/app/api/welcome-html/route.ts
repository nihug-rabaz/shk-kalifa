import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { AppLogger } from '@/utils/AppLogger';
import { getPurimRange } from '@/utils/PurimRange';
import { queryOne } from '@/lib/db';
import { boardRotation, isPhotoBoardLive, normalizePhotoBoard } from '@/lib/photo-board';

const BOARD_SWITCH_MS = 15000;
const BOARDS = ['1', '2', '3'];

// The board reloads every 15s, so this route must never wait on the network. The photo-board
// config is cached in memory and the query is given a hard deadline: when the database is
// unreachable (screen offline) we answer instantly from the last value we saw instead of
// stalling every single page load until the connection times out.
const PHOTO_CACHE_TTL_MS = 30_000;
const PHOTO_QUERY_TIMEOUT_MS = 1500;

type PhotoCacheEntry = { at: number; photoBoard: ReturnType<typeof normalizePhotoBoard>; known: boolean };
const photoCache = new Map<number, PhotoCacheEntry>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  p.catch(() => {}); // the loser of the race must not surface as an unhandled rejection
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('db timeout')), ms)),
  ]);
}

async function readPhotoBoard(groupId: number): Promise<PhotoCacheEntry> {
  const cached = photoCache.get(groupId);
  if (cached && Date.now() - cached.at < PHOTO_CACHE_TTL_MS) return cached;

  try {
    const row = await withTimeout(
      queryOne('select extras from board_content where group_id = $1', [groupId]),
      PHOTO_QUERY_TIMEOUT_MS,
    );
    const entry: PhotoCacheEntry = {
      at: Date.now(),
      photoBoard: normalizePhotoBoard((row?.extras as Record<string, unknown> | undefined)?.photoBoard),
      known: true,
    };
    photoCache.set(groupId, entry);
    return entry;
  } catch (e) {
    AppLogger.error('Could not read photo board config', { error: e });
    // Keep serving the last known value; only a screen that has never seen one gets "unknown",
    // which tells the client to fall back to its own cached board list.
    const entry: PhotoCacheEntry = cached
      ? { ...cached, at: Date.now() }
      : { at: Date.now(), photoBoard: normalizePhotoBoard(null), known: false };
    photoCache.set(groupId, entry);
    return entry;
  }
}

// The kiosk flips through the boards on a timer. Board 3 (the full-screen photo)
// only takes part when the manager enabled it AND picked an image, so `boards`
// is computed per request from the group's config. When the database can't be
// reached we send boardsKnown=false and the screen keeps using the last list it
// cached, instead of silently dropping board 3 during an outage.
function kioskScript(
  board: string,
  boardId: string | null,
  screenId: string | null,
  boards: number[],
  boardsKnown: boolean,
) {
  return `
<script>
(function(){
  var boardId = ${boardId ? JSON.stringify(boardId) : 'null'};
  var screenId = ${screenId ? JSON.stringify(screenId) : 'null'};
  var board = ${JSON.stringify(board)};
  var boards = ${JSON.stringify(boards)};
  var boardsKnown = ${boardsKnown ? 'true' : 'false'};
  var switchMs = ${BOARD_SWITCH_MS};

  var key = 'shchakim_boards_' + (boardId || 'default');
  try {
    if (boardsKnown) {
      localStorage.setItem(key, JSON.stringify(boards));
    } else {
      var cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached && cached.length) boards = cached;
    }
  } catch (e) {}

  setTimeout(function(){
    var i = boards.indexOf(Number(board));
    var next = boards[(i + 1) % boards.length] || boards[0] || 1;
    var p = new URLSearchParams(location.search);
    p.set('board', String(next));
    location.replace('/api/welcome-html?' + p.toString());
  }, switchMs);

  // Inside the /display shell the parent page already polls pairing status and swaps us out.
  if (!screenId || window.top !== window) return;
  setInterval(function(){
    fetch('/api/screens/' + screenId + '/status', { cache: 'no-store' })
      .then(function(r){ if (!r.ok) return null; return r.json(); })
      .then(function(st){
        if (!st) return;
        if (!st.paired || !st.groupId) { location.replace('/display'); return; }
        if (boardId && String(st.groupId) !== String(boardId)) {
          var p = new URLSearchParams(location.search);
          p.set('board_id', String(st.groupId));
          location.replace('/api/welcome-html?' + p.toString());
        }
      })
      .catch(function(){});
  }, 5000);
})();
</script>`;
}

// Preview-only: makes the board's own regions clickable. Every area that the manager
// can actually edit is mapped to one of the editors on the phone; a click anywhere
// else still opens the chooser, so no tap is a dead end.
function editScript() {
  return `
<script>
(function(){
  var REGIONS = [
    { key: 'prayers',  label: 'זמני תפילה',  sel: '.div-8, .div-9' },
    { key: 'safety',   label: 'דגשי בטיחות', sel: 'section.safety-section, .safety-content' },
    { key: 'updates',  label: 'עדכונים',     sel: 'section.did-you-know-section, .div-10, .div-11' },
    { key: 'letter',   label: 'איגרת רבצ״ר', sel: '.div-wrapper, .text-wrapper-6' },
    { key: 'support',  label: 'מוקדי תמיכה', sel: '.p.support-lines, .support-lines' },
    { key: 'photo',    label: 'תמונה מלאה',  sel: '.photo-board, .photo-board img' }
  ];

  var style = document.createElement('style');
  style.textContent = '.__edit-hot{outline:4px solid #4a90e2 !important;outline-offset:-4px;' +
    'background:rgba(74,144,226,0.12) !important;cursor:pointer}' +
    '.__edit-tip{position:fixed;z-index:2147483647;background:#1c4080;color:#fff;' +
    'font:700 26px/1.2 Ploni,Arial,sans-serif;padding:10px 18px;border-radius:999px;' +
    'pointer-events:none;transform:translate(-50%,-140%)}';
  document.head.appendChild(style);

  var tip = document.createElement('div');
  tip.className = '__edit-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);

  var current = null;
  function match(node){
    for (var el = node; el && el !== document.body; el = el.parentElement) {
      for (var i = 0; i < REGIONS.length; i++) {
        try { if (el.matches(REGIONS[i].sel)) return { el: el, region: REGIONS[i] }; } catch (e) {}
      }
    }
    return null;
  }
  function clear(){
    if (current) { current.el.classList.remove('__edit-hot'); current = null; }
    tip.style.display = 'none';
  }
  function highlight(e){
    var hit = match(e.target);
    if (!hit) { clear(); return; }
    if (current && current.el === hit.el) return;
    clear();
    current = hit;
    hit.el.classList.add('__edit-hot');
    var r = hit.el.getBoundingClientRect();
    tip.textContent = 'עריכת ' + hit.region.label;
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = Math.max(60, r.top) + 'px';
    tip.style.display = 'block';
  }
  document.addEventListener('pointermove', highlight, true);
  document.addEventListener('pointerdown', highlight, true);

  document.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    var hit = match(e.target);
    clear();
    parent.postMessage({
      source: 'board-edit',
      region: hit ? hit.region.key : null,
      label: hit ? hit.region.label : null
    }, window.location.origin);
  }, true);
})();
</script>`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedBoard = searchParams.get('board');
    const board_id = searchParams.get('board_id');
    const kiosk = searchParams.get('kiosk') === '1';
    const edit = searchParams.get('edit') === '1';
    const screenId = searchParams.get('screen');

    if (!requestedBoard || !BOARDS.includes(requestedBoard)) {
      return NextResponse.json({ error: 'Invalid board number. Use 1, 2 or 3' }, { status: 400 });
    }

    // Board 3's image + on/off switch live in board_content.extras.photoBoard.
    let photoBoard = normalizePhotoBoard(null);
    let boardsKnown = false;
    const groupId = Number(board_id);
    if (board_id && Number.isInteger(groupId)) {
      const entry = await readPhotoBoard(groupId);
      photoBoard = entry.photoBoard;
      boardsKnown = entry.known;
    }
    const photoLive = isPhotoBoardLive(photoBoard);
    const boards = boardRotation(photoLive);

    // Asked for board 3 while it is off → show board 1 rather than a blank screen.
    const board = requestedBoard === '3' && boardsKnown && !photoLive ? '1' : requestedBoard;

    const welcomeDir = `welcome${board}`;
    const htmlPath = join(process.cwd(), 'public', welcomeDir, 'index.html');

    try {
      let htmlContent = await readFile(htmlPath, 'utf-8');

      const basePath = `/${welcomeDir}`;
      htmlContent = htmlContent.replace(/href="globals\.css"/g, `href="${basePath}/globals.css"`);
      htmlContent = htmlContent.replace(/href="style\.css"/g, `href="${basePath}/style.css"`);
      htmlContent = htmlContent.replace(/src="img\/([^"]+)"/g, (match, filename) => {
        return `src="${basePath}/img/${filename}"`;
      });
      htmlContent = htmlContent.replace(/src="fonts\/([^"]+)"/g, (match, filename) => {
        return `src="${basePath}/fonts/${filename}"`;
      });
      htmlContent = htmlContent.replace(/src="fonts\/([^"]+)\/([^"]+)"/g, (match, dir, filename) => {
        return `src="${basePath}/fonts/${dir}/${filename}"`;
      });
      htmlContent = htmlContent.replace(/src="responsive\.js"/g, `src="${basePath}/responsive.js"`);
      htmlContent = htmlContent.replace(/src="time\.js"/g, `src="${basePath}/time.js"`);
      htmlContent = htmlContent.replace(/src="board-data\.js"/g, `src="${basePath}/board-data.js"`);
      htmlContent = htmlContent.replace(/src="photo-board\.js"/g, `src="${basePath}/photo-board.js"`);
      htmlContent = htmlContent.replace(/src="\.\.\/holiday-board\.js"/g, `src="/holiday-board.js"`);
      htmlContent = htmlContent.replace(/src="\.\.\/board-schedule\.js"/g, `src="/board-schedule.js"`);

      const purim = getPurimRange();
      const dataScript = `
        <script>
          ${board_id ? `window.BOARD_ID = ${JSON.stringify(board_id)};` : ''}
          window.BOARD_ASSET_BASE = ${JSON.stringify(basePath)};
          window.PHOTO_BOARD = ${boardsKnown ? JSON.stringify(photoBoard) : 'null'};
          window.PURIM_RANGE = { start: '${purim.start}', end: '${purim.end}' };
        </script>
      `;
      const kioskTag = kiosk ? kioskScript(board, board_id, screenId, boards, boardsKnown) : '';
      const editTag = edit ? editScript() : '';
      htmlContent = htmlContent.replace('</head>', `${dataScript}</head>`);
      htmlContent = htmlContent.replace('</body>', `${kioskTag}${editTag}</body>`);

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      });
    } catch (error) {
      AppLogger.error('Error reading HTML in welcome-html', { error });
      return NextResponse.json({ error: 'HTML file not found' }, { status: 404 });
    }
  } catch (error) {
    AppLogger.error('Welcome HTML API error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
