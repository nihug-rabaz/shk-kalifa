'use client';
import type { SupportLine } from '@/lib/types';
import { MAX_SUPPORT_LINES } from '@/lib/support-lines';

/* "מוקדי תמיכה" — העמודה השמאלית בלוח הראשי (public/welcome1 → .div-6). */

const uid = () => crypto.randomUUID();

export function SupportLinesEditor({
  value,
  onChange,
}: {
  value: SupportLine[];
  onChange: (v: SupportLine[]) => void;
}) {
  const set = (i: number, patch: Partial<SupportLine>) =>
    onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { id: uid(), label: '', phone: '' }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    onChange(next);
  };

  const full = value.length >= MAX_SUPPORT_LINES;

  return (
    <div className="card">
      <div className="setting-head">
        <div className="ic">☎️</div>
        <div>
          <h2>מוקדי תמיכה</h2>
          <p>המספרים שמופיעים בעמודה השמאלית של הלוח הראשי, מתחת לכותרת "מוקדי תמיכה".</p>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="empty small" style={{ padding: '18px 10px' }}>אין מוקדים — העמודה תישאר ריקה.</div>
      ) : (
        <div className="sl-list">
          {value.map((l, i) => (
            <div className="sl-row" key={l.id}>
              <div className="sl-fields">
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>שם המוקד</label>
                  <input
                    value={l.label}
                    maxLength={40}
                    placeholder="מוקד תקשוב"
                    onChange={(e) => set(i, { label: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>מספר טלפון</label>
                  <input
                    className="phone"
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                    maxLength={32}
                    value={l.phone}
                    placeholder="073-2432221"
                    onChange={(e) => set(i, { phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="sl-actions">
                <button type="button" className="sl-icon" title="העלה" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="sl-icon"
                  title="הורד"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button type="button" className="sl-icon danger" title="מחק" onClick={() => remove(i)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} disabled={full} onClick={add}>
        ＋ הוסף מוקד
      </button>
      {full && <div className="hint">הגעתם למקסימום {MAX_SUPPORT_LINES} מוקדים.</div>}
      {value.length > 4 && !full && (
        <div className="hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>
          יותר מ־4 מוקדים עלולים לחרוג מגובה העמודה על המסך.
        </div>
      )}

      {value.length > 0 && (
        <>
          <hr className="sep" />
          <div className="field" style={{ marginBottom: 0 }}>
            <label>כך זה ייראה על הלוח</label>
            <div className="sl-preview">
              <div className="sl-preview-title">מוקדי תמיכה</div>
              {value.map((l) => (
                <div key={l.id} className="sl-preview-item">
                  <div className="sl-preview-label">{l.label || '–'}</div>
                  <div className="sl-preview-phone" dir="ltr">{l.phone || '–'}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
