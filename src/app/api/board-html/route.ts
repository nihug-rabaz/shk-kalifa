import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');

    if (!board || (board !== '1' && board !== '2')) {
      return NextResponse.json(
        { error: 'Invalid board number. Use 1 or 2' },
        { status: 400 }
      );
    }

    const boardDirName = board === '1' ? 'לוח רבנות-01' : 'לוח רבנות-02';
    const htmlPath = join(process.cwd(), boardDirName, 'index.html');

    try {
      let htmlContent = await readFile(htmlPath, 'utf-8');
      
      htmlContent = htmlContent.replace(/href="style\.css"/g, `href="/api/board-asset?board=${board}&file=style.css"`);
      htmlContent = htmlContent.replace(/src="images\/([^"]+)"/g, (match, filename) => {
        return `src="/api/board-asset?board=${board}&file=images/${filename}"`;
      });
      htmlContent = htmlContent.replace(/src="js\/([^"]+)"/g, (match, filename) => {
        return `src="/api/board-asset?board=${board}&file=js/${filename}"`;
      });

      const responsiveStyle = `
        <style>
          * {
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow-x: hidden;
            overflow-y: auto;
          }
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            min-height: 100vh;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
          }
          .l-constrained,
          .global_container_,
          .layer-1 {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 0;
          }
          @media (max-width: 1920px) {
            body {
              transform: scale(0.9);
              transform-origin: top center;
            }
          }
          @media (max-width: 1600px) {
            body {
              transform: scale(0.8);
              transform-origin: top center;
            }
          }
          @media (max-width: 1366px) {
            body {
              transform: scale(0.7);
              transform-origin: top center;
            }
          }
          @media (max-width: 1024px) {
            body {
              transform: scale(0.6);
              transform-origin: top center;
            }
          }
          @media (max-width: 768px) {
            body {
              transform: scale(0.5);
              transform-origin: top center;
              font-size: 14px;
            }
          }
          @media (max-width: 480px) {
            body {
              transform: scale(0.4);
              transform-origin: top center;
              font-size: 12px;
            }
          }
        </style>
      `;

      htmlContent = htmlContent.replace('</head>', `${responsiveStyle}</head>`);

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (error) {
      console.error('Error reading HTML:', error);
      return NextResponse.json(
        { error: 'HTML file not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Board HTML API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
