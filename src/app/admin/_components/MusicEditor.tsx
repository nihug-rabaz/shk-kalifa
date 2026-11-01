'use client';
import { useRef, useState } from 'react';
import type { MusicConfig } from '@/lib/types';
import { Switch } from './ui';

interface Track {
  id: string;
  filename: string;
  size_bytes: number;
}

export function MusicEditor({
  config,
  onChange,
  tracks,
  onUpload,
  onDelete,
}: {
  config: MusicConfig;
  onChange: (c: MusicConfig) => void;
  tracks: Track[];
  onUpload: (f: File, onProgress: (pct: number) => void) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (let n = 0; n < files.length; n++) {
        const prefix = files.length > 1 ? `${n + 1}/${files.length} · ` : '';
        setProgress(`${prefix}0%`);
        // eslint-disable-next-line no-await-in-loop
        await onUpload(files[n], (pct) => setProgress(`${prefix}${pct}%`));
      }
    } finally {
      setBusy(false);
      setProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700 }}>מוזיקת רקע</div>
            <div className="small muted">מתנגנת בלולאה על המסך, גם ללא אינטרנט</div>
          </div>
          <Switch checked={config.enabled} onChange={(v) => onChange({ ...config, enabled: v })} />
        </div>
        <div className="field">
          <label>עוצמה: {Math.round(config.volume * 100)}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(config.volume * 100)}
            onChange={(e) => onChange({ ...config, volume: Number(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Switch checked={config.shuffle} onChange={(v) => onChange({ ...config, shuffle: v })} label="ערבוב" />
          <Switch checked={config.loop} onChange={(v) => onChange({ ...config, loop: v })} label="לולאה" />
        </div>
      </div>

      <div className="section-title">רשימת השירים ({tracks.length})</div>
      <div className="list">
        {tracks.map((t) => (
          <div className="rowcard" key={t.id}>
            <div className="avatar">🎵</div>
            <div className="grow">
              <div
                className="title"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {t.filename}
              </div>
              <div className="meta">{(t.size_bytes / 1048576).toFixed(1)}MB</div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(t.id)}>
              מחק
            </button>
          </div>
        ))}
        {tracks.length === 0 && <div className="empty small">לא הועלו שירים.</div>}
      </div>

      <input ref={fileRef} type="file" accept="audio/*,video/mp4,.mp4" multiple hidden onChange={pick} />
      <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? `מעלה… ${progress}` : '＋ העלה קובצי מוזיקה'}
      </button>
    </div>
  );
}
