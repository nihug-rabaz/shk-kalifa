import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');
    const file = searchParams.get('file');

    if (!board || (board !== '1' && board !== '2')) {
      return NextResponse.json(
        { error: 'Invalid board number' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: 'File parameter is required' },
        { status: 400 }
      );
    }

    const boardDirName = board === '1' ? 'לוח רבנות-01' : 'לוח רבנות-02';
    const filePath = join(process.cwd(), boardDirName, file);

    try {
      const fileBuffer = await readFile(filePath);
      
      let contentType = 'application/octet-stream';
      if (file.endsWith('.css')) {
        contentType = 'text/css';
      } else if (file.endsWith('.js')) {
        contentType = 'application/javascript';
      } else if (file.endsWith('.png')) {
        contentType = 'image/png';
      } else if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (file.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (error) {
      console.error('Error reading file:', error);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Board asset API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

