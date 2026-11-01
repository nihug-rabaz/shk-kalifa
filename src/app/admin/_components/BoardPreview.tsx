'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// The boards are drawn for a 16:9 television. The preview renders them at TV size inside
// the iframe and scales the whole box down with a transform, so the phone shows exactly
// what hangs on the wall — same layout, same line breaks, just smaller.
const BOARD_W = 1920;
const BOARD_H = 1080;
const SWITCH_MS = 15000; // the rotation the screens themselves run on (see api/welcome-html)
const LABELS: Record<number, string> = { 1: 'לוח ראשי', 2: 'לוח משני', 3: 'תמונה מלאה' };

export function BoardPreview({
  groupId,
  boards,
  onClose,
}: {
  groupId: string;
  boards: number[];
  onClose: () => void;
}) {
  const list = boards.length ? boards : [1, 2];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [manualRotate, setManualRotate] = useState<boolean | null>(null);
  const [scale, setScale] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const board = list[Math.min(idx, list.length - 1)] ?? 1;
  const step = useCallback(
    (d: number) => setIdx((i) => (i + d + list.length) % list.length),
    [list.length],
  );

  // On a phone held upright a 16:9 board fitted to the width is a thin strip, so the
  // board is turned on its side instead. Turn the phone itself and the orientation
  // flips back on its own — then it is simply landscape, no rotation needed.
  const rotated = manualRotate ?? portrait;

  const measure = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    setPortrait(h > w && w < 700);
    // rotated, the board's bounding box is swapped: BOARD_H wide by BOARD_W tall
    const k = rotated ? Math.min(w / BOARD_H, h / BOARD_W) : Math.min(w / BOARD_W, h / BOARD_H);
    setScale(k > 0 ? k : 0);
  }, [rotated]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure]);

  // the page behind must not scroll under the overlay
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(1); // RTL: left is forward
      else if (e.key === 'ArrowRight') step(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  useEffect(() => {
    if (!playing || list.length < 2) return;
    // keyed on idx too, so moving by hand restarts the clock instead of cutting a board short
    const t = setTimeout(() => step(1), SWITCH_MS);
    return () => clearTimeout(t);
  }, [playing, idx, list.length, step]);

  // read after mount: the server has no `document`, and rendering the button from a
  // value that only exists in the browser breaks hydration
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      /* iOS and some embedded browsers refuse; the preview works without it */
    }
  }

  return (
    <div className="bp-root" ref={root}>
      <div className="bp-bar">
        <button className="bp-btn" onClick={onClose} aria-label="סגירה">
          ✕
        </button>
        <div className="t">
          תצוגה מקדימה
          <div className="sub">כך נראה המסך בטלוויזיה · התוכן השמור</div>
        </div>
        <button
          className="bp-btn"
          onClick={() => setManualRotate(!rotated)}
          aria-label={rotated ? 'ביטול סיבוב' : 'סיבוב למסך מלא'}
          title={rotated ? 'ביטול סיבוב' : 'סיבוב למסך מלא'}
        >
          ⟲
        </button>
        {canFullscreen && (
          <button
            className="bp-btn"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}
            title={fullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
        )}
      </div>

      <div
        className="bp-stage"
        ref={stage}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          touch.current = null;
          if (!t0) return;
          const dx = e.changedTouches[0].clientX - t0.x;
          const dy = e.changedTouches[0].clientY - t0.y;
          // rotated, the board's "sideways" is the phone's vertical axis — follow the
          // bigger movement so a swipe works whichever way the phone is being held
          const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
          if (Math.abs(d) < 40) return;
          setPlaying(false);
          step(d > 0 ? -1 : 1);
        }}
      >
        <div
          className="bp-frame"
          style={{
            transform: `translate(-50%, -50%) ${rotated ? 'rotate(90deg) ' : ''}scale(${scale})`,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          <iframe
            key={board}
            src={`/api/welcome-html?board=${board}&board_id=${encodeURIComponent(groupId)}`}
            title={LABELS[board] || `לוח ${board}`}
            scrolling="no"
          />
        </div>
      </div>

      <div className="bp-foot">
        <button className="bp-btn" onClick={() => { setPlaying(false); step(-1); }} aria-label="הקודם">
          ›
        </button>
        <button
          className="bp-btn bp-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'עצירה' : 'הפעלה'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="bp-btn" onClick={() => { setPlaying(false); step(1); }} aria-label="הבא">
          ‹
        </button>
        <div className="bp-dots">
          {list.map((b, i) => (
            <button
              key={b}
              className={i === idx ? 'on' : ''}
              onClick={() => { setPlaying(false); setIdx(i); }}
              aria-label={LABELS[b] || `לוח ${b}`}
            />
          ))}
        </div>
        <div className="bp-name">{LABELS[board] || `לוח ${board}`}</div>
      </div>
    </div>
  );
}
