'use client';
import type { Letter } from '@/lib/types';

export function LetterEditor({
  value,
  onChange,
}: {
  value: Letter | null;
  onChange: (v: Letter | null) => void;
}) {
  const l = value || {};
  const patch = (p: Partial<Letter>) => onChange({ ...l, ...p });

  return (
    <div className="card">
      <div className="field">
        <label>פרשת השבוע</label>
        <input value={l.parasha || ''} onChange={(e) => patch({ parasha: e.target.value })} placeholder="לדוגמה: בראשית" />
        <div className="hint">מופיע בכותרת: ״איגרת רבצ״ר - פרשת …״</div>
      </div>
      <div className="field">
        <label>תוכן האיגרת</label>
        <textarea
          style={{ minHeight: 220 }}
          value={l.html || ''}
          onChange={(e) => patch({ html: e.target.value })}
          placeholder="טקסט האיגרת…"
        />
        <div className="hint">הטקסט מתפזר אוטומטית לעמודות בלוח.</div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>חתימה (אופציונלי)</label>
        <input value={l.signature || ''} onChange={(e) => patch({ signature: e.target.value })} />
      </div>
      <hr className="sep" />
      <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange(null)}>
        נקה איגרת
      </button>
    </div>
  );
}
