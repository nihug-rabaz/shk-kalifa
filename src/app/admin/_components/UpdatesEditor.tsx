'use client';
import { useEffect, useRef, useState } from 'react';
import type { BoardUpdate } from '@/lib/types';

const TYPES = [
  { v: 'עדכון כללי', l: 'עדכון כללי (טקסט)' },
  { v: 'דגשי בטיחות', l: 'דגשי בטיחות (טקסט נגלל)' },
  { v: 'הידעת?', l: 'הידעת? (תמונה)' },
  { v: 'ימי ישיבה', l: 'ימי ישיבה (תמונה)' },
];
const isImageType = (t?: string) => t === 'הידעת?' || t === 'ימי ישיבה';
const uid = () => crypto.randomUUID();

/* ── משך הצגה ──────────────────────────────────────────────────────────────
   expiresAt הוא רגע בזמן (ISO). ריק = מוצג לתמיד. השרת מסנן עדכונים שפג
   תוקפם מהמידע שנשלח למסכים, והלוח מסנן שוב בזמן ההצגה — ראו
   src/lib/updates-window.ts ו-public/board-schedule.js. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const PRESETS: { label: string; at: (now: number) => number }[] = [
  {
    label: 'עד סוף היום',
    at: (now) => {
      const d = new Date(now);
      d.setHours(23, 59, 0, 0);
      return d.getTime() <= now ? d.getTime() + DAY : d.getTime();
    },
  },
  { label: '24 שעות', at: (now) => now + DAY },
  { label: '3 ימים', at: (now) => now + 3 * DAY },
  { label: 'שבוע', at: (now) => now + 7 * DAY },
  {
    label: 'חודש',
    at: (now) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    },
  },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → הערך של <input type="datetime-local"> (שעון מקומי). */
function toInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** הערך של <input type="datetime-local"> (שעון מקומי) → ISO. */
function fromInputValue(v: string): string | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const ABS_FMT = new Intl.DateTimeFormat('he-IL', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
function formatAbsolute(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : ABS_FMT.format(d);
}

/** מנוסח בשתי יחידות ובעיגול כלפי מטה, כדי שלא יבטיח יותר זמן ממה שנשאר. */
function heDuration(ms: number): string {
  const abs = Math.max(0, ms);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  const minutes = Math.floor((abs % HOUR) / MINUTE);
  const hoursText = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;

  if (days >= 1) {
    const daysText = days === 1 ? 'יום' : days === 2 ? 'יומיים' : `${days} ימים`;
    return hours ? `${daysText} ו־${hoursText}` : daysText;
  }
  if (hours >= 1) return minutes ? `${hoursText} ו־${minutes} דק׳` : hoursText;
  if (minutes >= 1) return minutes === 1 ? 'דקה' : `${minutes} דקות`;
  return 'פחות מדקה';
}

type Status = { tone: 'ok' | 'warn' | 'danger'; text: string; expired: boolean };

function statusOf(u: BoardUpdate, now: number): Status {
  const ms = u.expiresAt ? Date.parse(u.expiresAt) : NaN;
  if (!u.expiresAt || Number.isNaN(ms)) return { tone: 'ok', text: 'מוצג · ללא הגבלה', expired: false };
  if (ms <= now) return { tone: 'danger', text: `פג תוקף · ${formatAbsolute(u.expiresAt)}`, expired: true };
  return { tone: ms - now <= DAY ? 'warn' : 'ok', text: `מוצג · עוד ${heDuration(ms - now)}`, expired: false };
}

/** שעון חי — כדי שהסטטוס והספירה לאחור יתעדכנו מעצמם. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function ScheduleField({
  u,
  now,
  onChange,
}: {
  u: BoardUpdate;
  now: number;
  onChange: (patch: Partial<BoardUpdate>) => void;
}) {
  const dated = !!u.expiresAt;
  const expiredAtMs = u.expiresAt ? Date.parse(u.expiresAt) : NaN;
  const expired = dated && !Number.isNaN(expiredAtMs) && expiredAtMs <= now;

  return (
    <div className="sched">
      <div className="sched-title">⏳ משך הצגה על המסך</div>

      <div className="seg" role="group" aria-label="משך הצגה">
        <button type="button" className={!dated ? 'on' : ''} onClick={() => onChange({ expiresAt: null })}>
          ♾️ לתמיד
        </button>
        <button
          type="button"
          className={dated ? 'on' : ''}
          onClick={() => {
            if (!dated) onChange({ expiresAt: new Date(Date.now() + DAY).toISOString() });
          }}
        >
          📅 עד תאריך ושעה
        </button>
      </div>

      {dated ? (
        <>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="preset"
                onClick={() => onChange({ expiresAt: new Date(p.at(Date.now())).toISOString() })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={toInputValue(u.expiresAt)}
            onChange={(e) => onChange({ expiresAt: fromInputValue(e.target.value) })}
          />
          <div className={`sched-hint${expired ? ' bad' : ''}`}>
            {expired ? (
              <>
                התאריך שנבחר כבר עבר — העדכון אינו מוצג על המסך.{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onChange({ expiresAt: new Date(Date.now() + 7 * DAY).toISOString() })}
                >
                  הארך בשבוע
                </button>
              </>
            ) : (
              <>העדכון ירד מהמסך אוטומטית ב־{formatAbsolute(u.expiresAt)}.</>
            )}
          </div>
        </>
      ) : (
        <div className="sched-hint">העדכון יישאר על המסך עד שתמחקו אותו.</div>
      )}
    </div>
  );
}

function UpdateRow({
  u,
  now,
  onChange,
  onRemove,
  onUploadImage,
}: {
  u: BoardUpdate;
  now: number;
  onChange: (patch: Partial<BoardUpdate>) => void;
  onRemove: () => void;
  onUploadImage: (f: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const status = statusOf(u, now);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const url = await onUploadImage(f);
      onChange({ imageUrl: url });
    } catch {
      /* surfaced by parent toast */
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className={`card update-card${status.expired ? ' is-expired' : ''}`}>
      <div className="update-head">
        <span className="update-kind">{isImageType(u.type) ? '🖼️' : '📝'} {u.type || 'עדכון'}</span>
        <span className={`chip chip-${status.tone}`}>
          <span className="dot" />
          {status.text}
        </span>
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <label>סוג</label>
        <select
          value={u.type || 'עדכון כללי'}
          onChange={(e) => {
            const type = e.target.value;
            onChange({ type, title: u.title && u.title !== u.type ? u.title : type });
          }}
        >
          {TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.l}
            </option>
          ))}
        </select>
      </div>

      {isImageType(u.type) ? (
        <div className="field" style={{ marginBottom: 8 }}>
          <label>תמונה</label>
          {u.imageUrl ? (
            <img
              src={u.imageUrl}
              alt=""
              style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 10, background: '#f4f7f5' }}
            />
          ) : (
            <div className="small muted">לא נבחרה תמונה</div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'מעלה…' : u.imageUrl ? 'החלף תמונה' : 'העלה תמונה'}
          </button>
        </div>
      ) : (
        <div className="field" style={{ marginBottom: 8 }}>
          <label>תוכן</label>
          <textarea value={u.content || ''} onChange={(e) => onChange({ content: e.target.value })} />
        </div>
      )}

      <div className="row">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>כותרת (אופציונלי)</label>
          <input value={u.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>זמן בסבב (שנ׳)</label>
          <input
            type="number"
            min={3}
            value={u.displayTime ?? 20}
            onChange={(e) => onChange({ displayTime: Number(e.target.value) })}
          />
          <div className="hint">כמה שניות בכל הופעה</div>
        </div>
      </div>

      <hr className="sep" />
      <ScheduleField u={u} now={now} onChange={onChange} />

      <hr className="sep" />
      <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
        מחק עדכון
      </button>
    </div>
  );
}

export function UpdatesEditor({
  value,
  onChange,
  onUploadImage,
}: {
  value: BoardUpdate[];
  onChange: (v: BoardUpdate[]) => void;
  onUploadImage: (f: File) => Promise<string>;
}) {
  const now = useNow();
  const set = (i: number, patch: Partial<BoardUpdate>) =>
    onChange(value.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  const add = () =>
    onChange([
      ...value,
      { id: uid(), type: 'עדכון כללי', title: 'עדכון כללי', content: '', displayTime: 20, expiresAt: null },
    ]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const expiredCount = value.filter((u) => statusOf(u, now).expired).length;
  const liveCount = value.length - expiredCount;

  return (
    <div>
      {value.length === 0 ? (
        <div className="empty small">אין עדכונים עדיין.</div>
      ) : (
        <div className="updates-summary">
          <span className="chip chip-ok">
            <span className="dot" />
            {liveCount} מוצגים על המסך
          </span>
          {expiredCount > 0 && (
            <span className="chip chip-danger">
              <span className="dot" />
              {expiredCount} פג תוקף
            </span>
          )}
        </div>
      )}

      <div className="list">
        {value.map((u, i) => (
          <UpdateRow
            key={u.id}
            u={u}
            now={now}
            onChange={(patch) => set(i, patch)}
            onRemove={() => remove(i)}
            onUploadImage={onUploadImage}
          />
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-block" onClick={add}>
        ＋ הוסף עדכון
      </button>
    </div>
  );
}
