import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { AppLogger } from '@/utils/AppLogger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');
    const board_id = searchParams.get('board_id');

    if (!board || (board !== '1' && board !== '2')) {
      return NextResponse.json(
        { error: 'Invalid board number. Use 1 or 2' },
        { status: 400 }
      );
    }

    const welcomeDir = board === '1' ? 'welcome1' : 'welcome2';
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

      const dataScript = `
        <script>
          ${board_id ? `window.BOARD_ID = '${board_id}';` : ''}
          ${board_id ? `window.BOARD_DATA_API = '/api/board-data?board_id=${board_id}';` : ''}
        </script>
      `;
      htmlContent = htmlContent.replace('</head>', `${dataScript}</head>`);

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (error) {
      AppLogger.error('Error reading HTML in welcome-html', { error });
      return NextResponse.json(
        { error: 'HTML file not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    AppLogger.error('Welcome HTML API error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
