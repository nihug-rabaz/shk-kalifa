'use client';
import type { Prayer } from '@/lib/types';

const TITLES = ['שחרית', 'מנחה', 'ערבית'];
const LOCS = ['בית כנסת מרכזי', 'בית כנסת רבנות', 'חמל רבצר'];
const BASES = [
  { v: 'sunset', l: 'שקיעה' },
  { v: 'stars_out', l: 'צאת הכוכבים' },
  { v: 'stars_out_90', l: 'צאת הכוכבים (90 ד׳)' },
];
const uid = () => crypto.randomUUID();

export function PrayersEditor({
  value,
  onChange,
}: {
  value: Prayer[];
  onChange: (v: Prayer[]) => void;
}) {
  const set = (i: number, patch: Partial<Prayer>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () =>
    onChange([
      ...value,
      { id: uid(), title: 'שחרית', timeType: 'fixed', fixedTime: '06:30', location: LOCS[0] },
    ]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const a = [...value];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };

  return (
    <div>
      {value.length === 0 && <div className="empty small">אין תפילות עדיין.</div>}
      <div className="list">
        {value.map((p, i) => (
          <div className="card" key={p.id}>
            <div className="row">
              <div className="field" style={{ marginBottom: 8 }}>
                <label>תפילה</label>
                <input
                  list={`titles-${i}`}
                  value={p.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
                <datalist id={`titles-${i}`}>
                  {TITLES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>מיקום</label>
                <select value={p.location || ''} onChange={(e) => set(i, { location: e.target.value })}>
                  {LOCS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  {p.location && !LOCS.includes(p.location) && <option value={p.location}>{p.location}</option>}
                </select>
              </div>
            </div>

            <div className="tabs" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={p.timeType === 'fixed' ? 'active' : ''}
                onClick={() => set(i, { timeType: 'fixed' })}
              >
                שעה קבועה
              </button>
              <button
                type="button"
                className={p.timeType === 'relative' ? 'active' : ''}
                onClick={() => set(i, { timeType: 'relative' })}
              >
                יחסי לזמן היום
              </button>
            </div>

            {p.timeType === 'fixed' ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>שעה</label>
                <input type="time" value={p.fixedTime || ''} onChange={(e) => set(i, { fixedTime: e.target.value })} />
              </div>
            ) : (
              <div className="row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>ביחס ל־</label>
                  <select
                    value={p.relativeBase || 'stars_out'}
                    onChange={(e) => set(i, { relativeBase: e.target.value as Prayer['relativeBase'] })}
                  >
                    {BASES.map((b) => (
                      <option key={b.v} value={b.v}>
                        {b.l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>היסט (דקות)</label>
                  <input
                    type="number"
                    value={p.offsetMinutes ?? 0}
                    onChange={(e) => set(i, { offsetMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}

            <hr className="sep" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)}>
                  ↓
                </button>
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(i)}>
                מחק תפילה
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-block" onClick={add}>
        ＋ הוסף תפילה
      </button>
    </div>
  );
}
