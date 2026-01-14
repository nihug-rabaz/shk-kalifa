import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { AppLogger } from '@/utils/AppLogger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');
    const filename = searchParams.get('filename') || 'linked_file_rectangle_rec.jpg';

    if (!board || (board !== '1' && board !== '2')) {
      return NextResponse.json(
        { error: 'Invalid board number. Use 1 or 2' },
        { status: 400 }
      );
    }

    const boardDirName = board === '1' ? 'לוח רבנות-01' : 'לוח רבנות-02';
    const imagePath = join(process.cwd(), boardDirName, 'images', filename);

    try {
      const imageBuffer = await readFile(imagePath);
      const contentType = filename.endsWith('.png') ? 'image/png' : 
                         filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 
                         'application/octet-stream';

      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (error) {
      AppLogger.error('Error reading image', { error, imagePath });
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    AppLogger.error('Board image API error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

