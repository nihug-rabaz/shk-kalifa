/* Shared board scheduling helpers — loaded by every welcomeN board BEFORE
   board-data.js. Two jobs:

   1. EXPIRY — an update may carry `expiresAt` (ISO instant; null = forever),
      set from the phone under "משך הצגה". The server already strips expired
      updates from /api/display/content; we filter again here so an update also
      disappears on time while the board is running on its localStorage cache,
      and the instant it expires rather than at the next poll.

   2. ROTATION — the kiosk reloads the whole page every 15s (board 1 ↔ board 2),
      so any rotation that starts at item #0 on every load can never reach
      item #1: the board froze on the first update forever. slotAt() derives the
      current item from the WALL CLOCK instead, so the sequence survives page
      reloads — and every screen in a group stays in sync on the same item.

   Exposed as window.BoardSchedule. board-data.js falls back to sane defaults if
   this file is missing (e.g. when opening public/welcomeN/index.html directly). */

(function () {
  'use strict';

  function nowMs(now) {
    return typeof now === 'number' && isFinite(now) ? now : Date.now();
  }

  var DEFAULT_SECONDS = 20;
  var MIN_SECONDS = 3;

  function durationMs(update) {
    var secs = Number(update && update.displayTime);
    if (!isFinite(secs) || secs <= 0) secs = DEFAULT_SECONDS;
    return Math.max(MIN_SECONDS, secs) * 1000;
  }

  function expiryMs(update) {
    var raw = update && update.expiresAt;
    if (!raw) return null;
    var ms = Date.parse(raw);
    return isNaN(ms) ? null : ms; // unparsable → treated as "forever"
  }

  /** Is the update inside its display window right now? */
  function isActive(update, now) {
    var ms = expiryMs(update);
    if (ms === null) return true;
    return ms > nowMs(now);
  }

  /** The updates that should be on screen right now. */
  function activeUpdates(list, now) {
    if (!list || !list.length) return [];
    var t = nowMs(now);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (isActive(list[i], t)) out.push(list[i]);
    }
    return out;
  }

  /** ms until the next update expires, or null if nothing is scheduled to expire. */
  function msUntilNextExpiry(list, now) {
    if (!list || !list.length) return null;
    var t = nowMs(now);
    var soonest = null;
    for (var i = 0; i < list.length; i++) {
      var ms = expiryMs(list[i]);
      if (ms === null || ms <= t) continue;
      if (soonest === null || ms < soonest) soonest = ms;
    }
    return soonest === null ? null : soonest - t;
  }

  /** Which item should be showing right now, and for how much longer.
      Derived from the epoch clock so it survives page reloads. */
  function slotAt(items, now) {
    if (!items || !items.length) return { index: 0, msUntilNext: 60000, total: 0 };

    var durations = [];
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var d = durationMs(items[i]);
      durations.push(d);
      total += d;
    }
    if (total <= 0) return { index: 0, msUntilNext: 60000, total: 0 };

    var offset = nowMs(now) % total;
    for (var j = 0; j < durations.length; j++) {
      if (offset < durations[j]) {
        return { index: j, msUntilNext: durations[j] - offset, total: total };
      }
      offset -= durations[j];
    }
    return { index: 0, msUntilNext: durations[0], total: total };
  }

  window.BoardSchedule = {
    isActive: isActive,
    activeUpdates: activeUpdates,
    msUntilNextExpiry: msUntilNextExpiry,
    slotAt: slotAt,
    durationMs: durationMs,
  };
})();
