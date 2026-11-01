'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend, apiUpload, ApiError } from '@/lib/api-client';
import { uploadAudio } from '@/lib/chunked-upload';
import { InjectPanel } from '../../_components/InjectPanel';
import { AuthGate } from '../../_components/AuthGate';
import { AppBar } from '../../_components/AppBar';
import { Spinner, Banner, useToast } from '../../_components/ui';
import { PrayersEditor } from '../../_components/PrayersEditor';
import { UpdatesEditor } from '../../_components/UpdatesEditor';
import { LetterEditor } from '../../_components/LetterEditor';
import { MusicEditor } from '../../_components/MusicEditor';
import { PhotoBoardEditor } from '../../_components/PhotoBoardEditor';
import { SupportLinesEditor } from '../../_components/SupportLinesEditor';
import { BoardPreview } from '../../_components/BoardPreview';
import { DEFAULT_PHOTO_BOARD, boardRotation, isPhotoBoardLive, normalizePhotoBoard } from '@/lib/photo-board';
import { DEFAULT_SUPPORT_LINES, normalizeSupportLines } from '@/lib/support-lines';
import type {
  Prayer, BoardUpdate, Letter, MusicConfig, GroupLocation, Theme, PhotoBoard, SupportLine,
} from '@/lib/types';

type Tab = 'content' | 'music' | 'settings' | 'screens';

interface ScreenRow {
  id: string;
  name: string | null;
  group_id: number | null;
  online: boolean;
}

function normMusic(m: any): MusicConfig {
  return {
    enabled: !!m?.enabled,
    volume: typeof m?.volume === 'number' ? m.volume : 0.6,
    shuffle: m?.shuffle !== false,
    loop: m?.loop !== false,
  };
}
function normTheme(t: any): Theme {
  const gradient = Array.isArray(t?.gradient) && t.gradient.length >= 2 ? t.gradient : ['#bbdfc5', '#d9efe0'];
  return { primaryHex: t?.primaryHex || '#1c4080', gradient };
}

const CITIES = [
  { label: 'ירושלים', latitude: 31.7683, longitude: 35.2137, elevation: 754 },
  { label: 'תל אביב', latitude: 32.0853, longitude: 34.7818, elevation: 5 },
  { label: 'חיפה', latitude: 32.794, longitude: 34.9896, elevation: 30 },
  { label: 'באר שבע', latitude: 31.2518, longitude: 34.7913, elevation: 280 },
  { label: 'צפת', latitude: 32.9646, longitude: 35.496, elevation: 850 },
  { label: 'אילת', latitude: 29.5577, longitude: 34.9519, elevation: 12 },
];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <div className="color-row">
        <input type="color" className="swatch" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          className="hex"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function SettingHead({ icon, title, subtitle, danger }: { icon: string; title: string; subtitle: string; danger?: boolean }) {
  return (
    <div className="setting-head">
      <div className="ic" style={danger ? { background: '#fbeaea', color: 'var(--danger)' } : undefined}>{icon}</div>
      <div>
        <h2 style={danger ? { color: 'var(--danger)' } : undefined}>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const router = useRouter();
  const { show, node } = useToast();
  const [tab, setTab] = useState<Tab>('content');
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState<GroupLocation>({});
  const [theme, setTheme] = useState<Theme>({ primaryHex: '#1c4080', gradient: ['#bbdfc5', '#d9efe0'] });
  const [music, setMusic] = useState<MusicConfig>(normMusic(null));

  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [updates, setUpdates] = useState<BoardUpdate[]>([]);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [photoBoard, setPhotoBoard] = useState<PhotoBoard>(DEFAULT_PHOTO_BOARD);
  const [supportLines, setSupportLines] = useState<SupportLine[]>(DEFAULT_SUPPORT_LINES);
  // everything else already stored under board_content.extras — preserved on save
  const [extras, setExtras] = useState<Record<string, unknown>>({});

  const [tracks, setTracks] = useState<{ id: string; filename: string; size_bytes: number }[]>([]);
  const [screens, setScreens] = useState<ScreenRow[]>([]);

  async function loadAll() {
    setErr('');
    try {
      const [g, media, s] = await Promise.all([
        apiGet(`/api/groups/${id}`),
        apiGet(`/api/groups/${id}/media?kind=music`),
        apiGet('/api/screens'),
      ]);
      setName(g.group.name || '');
      setDisplayName(g.group.display_name || '');
      setLocation(g.group.location || {});
      setTheme(normTheme(g.group.theme));
      setMusic(normMusic(g.group.music));
      setPrayers(g.content?.prayers || []);
      setUpdates(g.content?.updates || []);
      setLetter(g.content?.letter || null);
      setExtras(g.content?.extras || {});
      setPhotoBoard(normalizePhotoBoard(g.content?.extras?.photoBoard));
      // never edited yet -> seed the editor with what the board's own HTML shows
      setSupportLines(normalizeSupportLines(g.content?.extras?.supportLines) ?? DEFAULT_SUPPORT_LINES);
      setTracks(media.media || []);
      setScreens((s.screens as ScreenRow[]).filter((x) => x.group_id === Number(id)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function uploadImage(f: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('kind', 'image');
    try {
      const res = await apiUpload(`/api/groups/${id}/media`, fd);
      return `/api/media/${res.media.id}`;
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'העלאה נכשלה');
      throw e;
    }
  }

  async function uploadMusic(f: File, onProgress: (pct: number) => void) {
    try {
      await uploadAudio(id, f, { kind: 'music', onProgress });
      const media = await apiGet(`/api/groups/${id}/media?kind=music`);
      setTracks(media.media || []);
      // Uploading a song means "play it" — switch music on right away instead of
      // leaving it silently off until someone also flips the switch and saves.
      if (!music.enabled) {
        const next = { ...music, enabled: true };
        await apiSend(`/api/groups/${id}`, 'PUT', { music: next });
        setMusic(next);
      }
      show('השיר הועלה ✓ — יתנגן במסכים תוך כחצי דקה');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'העלאה נכשלה');
    }
  }
  async function deleteMusic(mid: string) {
    try {
      await apiSend(`/api/media/${mid}`, 'DELETE');
      setTracks((t) => t.filter((x) => x.id !== mid));
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'מחיקה נכשלה');
    }
  }

  async function save() {
    setSaving(true);
    try {
      let outLetter: Letter | null = letter;
      const hasLetter = !!(letter && (letter.html?.trim() || letter.parasha?.trim() || letter.signature?.trim()));
      outLetter = hasLetter ? { ...letter, id: crypto.randomUUID() } : null;

      await apiSend(`/api/groups/${id}`, 'PUT', {
        name,
        display_name: displayName || null,
        location,
        theme,
        music,
      });
      await apiSend(`/api/groups/${id}/content`, 'PUT', {
        prayers,
        updates,
        letter: outLetter,
        extras: { ...extras, photoBoard, supportLines },
      });
      show('נשמר בהצלחה ✓');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup() {
    if (!confirm(`למחוק את הקבוצה "${name}"? כל התוכן והמוזיקה יימחקו.`)) return;
    try {
      await apiSend(`/api/groups/${id}`, 'DELETE');
      router.replace('/admin');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'מחיקה נכשלה');
    }
  }

  async function unassign(sid: string) {
    try {
      await apiSend(`/api/screens/${sid}`, 'PUT', { groupId: null });
      setScreens((arr) => arr.filter((x) => x.id !== sid));
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'שגיאה');
    }
  }

  if (loading) {
    return (
      <>
        <AppBar title="עריכת קבוצה" back="/admin" />
        <Spinner />
      </>
    );
  }

  const grad0 = theme.gradient?.[0] || '#bbdfc5';
  const grad1 = theme.gradient?.[1] || '#d9efe0';
  const primaryHex = theme.primaryHex || '#1c4080';
  const cityValue = CITIES.some((c) => c.label === location.label) ? (location.label as string) : '__custom__';

  return (
    <>
      <AppBar
        title={name || 'עריכת קבוצה'}
        back="/admin"
        right={
          <button
            className="iconbtn"
            onClick={() => setPreview(true)}
            aria-label="תצוגה מקדימה"
            title="תצוגה מקדימה"
          >
            📺
          </button>
        }
      />
      <div className="container">
        {err && <Banner kind="err">{err}</Banner>}

        <div className="tabs">
          <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>
            תוכן
          </button>
          <button className={tab === 'music' ? 'active' : ''} onClick={() => setTab('music')}>
            מוזיקה
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            הגדרות
          </button>
          <button className={tab === 'screens' ? 'active' : ''} onClick={() => setTab('screens')}>
            מסכים ({screens.length})
          </button>
        </div>

        {tab === 'content' && (
          <>
            <div className="section-title">זמני תפילה</div>
            <PrayersEditor value={prayers} onChange={setPrayers} />
            <div className="section-title">עדכונים והודעות</div>
            <UpdatesEditor value={updates} onChange={setUpdates} onUploadImage={uploadImage} />
            <div className="section-title">איגרת רבצ״ר</div>
            <LetterEditor value={letter} onChange={setLetter} />
            <div className="section-title">מוקדי תמיכה</div>
            <SupportLinesEditor value={supportLines} onChange={setSupportLines} />
            <div className="section-title">מסך תמונה מלאה</div>
            <PhotoBoardEditor value={photoBoard} onChange={setPhotoBoard} onUploadImage={uploadImage} />
          </>
        )}

        {tab === 'music' && (
          <MusicEditor
            config={music}
            onChange={setMusic}
            tracks={tracks}
            onUpload={uploadMusic}
            onDelete={deleteMusic}
          />
        )}
        {tab === 'music' && <InjectPanel groupId={id} show={show} />}

        {tab === 'settings' && (
          <>
            <div className="card">
              <SettingHead icon="🏷️" title="שם וכותרת" subtitle="שם פנימי לזיהוי הקבוצה, וכותרת שמופיעה בראש הלוח." />
              <div className="field">
                <label>שם הקבוצה (פנימי)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>כותרת הלוח</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="מפקדת הרבנות הצבאית"
                />
                <div className="hint">ריק = ברירת המחדל.</div>
              </div>
            </div>

            <div className="card">
              <SettingHead icon="📍" title="מיקום" subtitle="קובע את זמני היום (זריחה, שקיעה, צאת הכוכבים) לחישוב זמני התפילה." />
              <div className="field">
                <label>עיר</label>
                <select
                  value={cityValue}
                  onChange={(e) => {
                    const c = CITIES.find((x) => x.label === e.target.value);
                    if (c) setLocation({ ...c, timezone: 'Asia/Jerusalem' });
                  }}
                >
                  {CITIES.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                    </option>
                  ))}
                  <option value="__custom__">מותאם אישית…</option>
                </select>
              </div>
              <div className="row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>קו רוחב</label>
                  <input
                    type="number"
                    value={location.latitude ?? ''}
                    onChange={(e) => setLocation({ ...location, latitude: Number(e.target.value), label: location.label })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>קו אורך</label>
                  <input
                    type="number"
                    value={location.longitude ?? ''}
                    onChange={(e) => setLocation({ ...location, longitude: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <SettingHead icon="🎨" title="עיצוב" subtitle="צבע הטקסט הראשי ורקע הגרדיאנט של הלוח." />
              <div className="theme-preview" style={{ background: `linear-gradient(135deg, ${grad0}, ${grad1})` }}>
                <span style={{ color: primaryHex }}>ברוכים הבאים</span>
              </div>
              <ColorField label="צבע ראשי (טקסט)" value={primaryHex} onChange={(v) => setTheme({ ...theme, primaryHex: v })} />
              <div className="row" style={{ marginTop: 14 }}>
                <ColorField label="רקע 1" value={grad0} onChange={(v) => setTheme({ ...theme, gradient: [v, grad1] })} />
                <ColorField label="רקע 2" value={grad1} onChange={(v) => setTheme({ ...theme, gradient: [grad0, v] })} />
              </div>
            </div>

            <div className="card danger-card">
              <SettingHead icon="⚠️" title="מחיקת קבוצה" subtitle="מוחק לצמיתות את הקבוצה, התוכן והמוזיקה. לא ניתן לשחזר." danger />
              <button className="btn btn-danger btn-block" onClick={deleteGroup}>
                מחק את הקבוצה
              </button>
            </div>
          </>
        )}

        {tab === 'screens' && (
          <>
            <div className="card">
              <div className="small muted">
                כדי להוסיף מסך: פתח את הלוח בטלוויזיה, סרוק את קוד ה-QR שמופיע, ובחר בקבוצה זו. או עבור אל{' '}
                <a className="link" href="/admin/screens">
                  ניהול מסכים
                </a>
                .
              </div>
            </div>
            {screens.length === 0 ? (
              <div className="empty small">אין מסכים משויכים לקבוצה זו.</div>
            ) : (
              <div className="list">
                {screens.map((s) => (
                  <div className="rowcard" key={s.id}>
                    <div className="avatar">📺</div>
                    <div className="grow">
                      <div className="title">{s.name || 'מסך ללא שם'}</div>
                      <div className="meta">
                        <span className={`chip ${s.online ? 'chip-ok' : 'chip-off'}`}>
                          <span className="dot" />
                          {s.online ? 'מחובר' : 'לא מחובר'}
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => unassign(s.id)}>
                      הסר
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {tab !== 'screens' && !preview && (
        <button className="fab" onClick={save} disabled={saving}>
          {saving ? 'שומר…' : '💾 שמור שינויים'}
        </button>
      )}
      {preview && (
        <BoardPreview
          groupId={id}
          boards={boardRotation(isPhotoBoardLive(photoBoard))}
          onClose={() => setPreview(false)}
        />
      )}
      {node}
    </>
  );
}

export default function Page({ params }: { params: { id: string } }) {
  return (
    <AuthGate>
      <Editor id={params.id} />
    </AuthGate>
  );
}
