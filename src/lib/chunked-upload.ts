// Client-side chunked upload for audio files. A Vercel function body is capped at 4.5 MB —
// smaller than most songs — so the file goes up in parts (see src/lib/media-store.ts).
import { apiSend, apiPutBinary } from '@/lib/api-client';

/** Track length in seconds, read by the browser (null if it can't tell). */
export function audioDuration(f: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(f);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    a.src = url;
  });
}

export async function uploadAudio(
  groupId: string,
  f: File,
  opts: { kind: 'music' | 'inject'; headers?: Record<string, string>; onProgress?: (pct: number) => void },
) {
  const init = await apiSend(
    `/api/groups/${groupId}/media`,
    'POST',
    {
      kind: opts.kind,
      filename: f.name,
      mime: f.type,
      size: f.size,
      duration: await audioDuration(f),
    },
    opts.headers,
  );
  const mediaId = init.media.id as string;
  try {
    const { chunkSize, parts } = init as { chunkSize: number; parts: number };
    for (let i = 0; i < parts; i++) {
      // eslint-disable-next-line no-await-in-loop
      await apiPutBinary(`/api/media/${mediaId}/parts/${i}`, f.slice(i * chunkSize, (i + 1) * chunkSize));
      opts.onProgress?.(Math.round(((i + 1) / parts) * 100));
    }
    return (await apiSend(`/api/media/${mediaId}/complete`, 'POST')).media;
  } catch (e) {
    apiSend(`/api/media/${mediaId}`, 'DELETE').catch(() => {});
    throw e;
  }
}
