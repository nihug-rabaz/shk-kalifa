'use client';
import { useRef, useState } from 'react';
import type { PhotoBoard } from '@/lib/types';
import { Switch } from './ui';

/* המסך השלישי: תמונה אחת על כל המסך, שמצטרפת לסבב הלוחות בטלוויזיה.
   נשמר ב-board_content.extras.photoBoard ומוגש ע"י public/welcome3. */

const FITS: { v: 'cover' | 'contain'; label: string; hint: string }[] = [
  { v: 'cover', label: 'מילוי המסך', hint: 'התמונה ממלאת את כל המסך. שוליים עלולים להיחתך.' },
  { v: 'contain', label: 'התאמה מלאה', hint: 'כל התמונה נראית, עם רקע בצדדים אם הפרופורציות שונות.' },
];

export function PhotoBoardEditor({
  value,
  onChange,
  onUploadImage,
}: {
  value: PhotoBoard;
  onChange: (v: PhotoBoard) => void;
  onUploadImage: (f: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const enabled = !!value.enabled;
  const hasImage = !!value.imageUrl;
  const fit = value.fit === 'contain' ? 'contain' : 'cover';
  const status = !enabled
    ? { cls: 'chip-off', text: 'כבוי' }
    : hasImage
      ? { cls: 'chip-ok', text: 'פעיל בסבב' }
      : { cls: 'chip-danger', text: 'חסרה תמונה' };

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const url = await onUploadImage(f);
      onChange({ ...value, imageUrl: url });
    } catch {
      /* surfaced by the parent toast */
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="card">
      <div className="setting-head">
        <div className="ic">🖼️</div>
        <div>
          <h2>מסך תמונה מלאה</h2>
          <p>לוח שלישי בסבב הטלוויזיה — תמונה אחת שתופסת את כל המסך, אחרי הלוח הראשי והאיגרת.</p>
        </div>
      </div>

      <div className="pb-row">
        <Switch checked={enabled} onChange={(v) => onChange({ ...value, enabled: v })} label="להציג את המסך הזה" />
        <span className={`chip ${status.cls}`}>
          <span className="dot" />
          {status.text}
        </span>
      </div>

      {enabled && (
        <>
          <hr className="sep" />

          <div className="field">
            <label>התמונה שתוצג</label>
            {hasImage ? (
              <div className={`pb-preview pb-fit-${fit}`}>
                <img src={value.imageUrl as string} alt="" />
              </div>
            ) : (
              <div className="pb-preview pb-empty">לא נבחרה תמונה</div>
            )}
            <div className="hint">תצוגה מקדימה של המסך המלא ביחס 16:9.</div>

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
            <div className="pb-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'מעלה…' : hasImage ? 'החלף תמונה' : 'העלה תמונה'}
              </button>
              {hasImage && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange({ ...value, imageUrl: null })}>
                  הסר תמונה
                </button>
              )}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>אופן ההצגה</label>
            <div className="seg" role="group" aria-label="אופן ההצגה">
              {FITS.map((f) => (
                <button
                  key={f.v}
                  type="button"
                  className={fit === f.v ? 'on' : ''}
                  onClick={() => onChange({ ...value, fit: f.v })}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="hint">{FITS.find((f) => f.v === fit)?.hint}</div>
          </div>

          {!hasImage && (
            <div className="banner banner-err" style={{ marginTop: 14, marginBottom: 0 }}>
              עד שתעלו תמונה, המסך הזה מדולג והטלוויזיה ממשיכה להתחלף בין שני הלוחות הרגילים.
            </div>
          )}
        </>
      )}
    </div>
  );
}
