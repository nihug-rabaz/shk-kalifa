/* Board 3 - paints the full-screen photo.

   window.PHOTO_BOARD is injected by /api/welcome-html straight from the group's config
   ({ enabled, imageUrl, fit }). It is null when the server could not reach the database; in that
   case we fall back to the last config this screen saw, so an outage doesn't blank the board.

   OFFLINE: the image itself is kept in IndexedDB (the same store the other board images use), so it
   survives a network outage, a reboot and an HTTP-cache eviction. /api/media/:id is immutable - a
   replaced image gets a new id - so reading from the cache first is both correct and instant. */

(function () {
  'use strict';

  var DB_NAME = 'ImageCacheDB';
  var DB_VERSION = 1;
  var STORE = 'images';

  var stage = document.getElementById('photo-board');
  var img = document.getElementById('photo');
  if (!stage || !img) return;

  function log(msg, extra) {
    try { if (console && console.warn) console.warn('[PHOTO-BOARD] ' + msg, extra || ''); } catch (e) {}
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }

  function getBlob(url) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var req = db.transaction([STORE], 'readonly').objectStore(STORE).get(url);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function putBlob(url, blob) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var req = db.transaction([STORE], 'readwrite').objectStore(STORE).put(blob, url);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  function show(src) {
    img.onload = function () { stage.classList.add('is-ready'); };
    img.onerror = function () { log('image failed to load', src); };
    img.src = src;
  }

  // ---- config: server first, last-known second -------------------------
  var key = 'shchakim_photo_board_' + (window.BOARD_ID || 'default');
  var cfg = window.PHOTO_BOARD || null;
  try {
    if (cfg) localStorage.setItem(key, JSON.stringify(cfg));
    else cfg = JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    /* private mode / quota - carry on with whatever we have */
  }

  if (!cfg || !cfg.enabled || !cfg.imageUrl) return; // nothing to show; the kiosk moves on

  img.style.objectFit = cfg.fit === 'contain' ? 'contain' : 'cover';
  var url = cfg.imageUrl;

  getBlob(url).then(function (blob) {
    if (blob) {
      show(URL.createObjectURL(blob)); // works with no network at all
      return;
    }
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    }).then(function (fresh) {
      show(URL.createObjectURL(fresh));
      putBlob(url, fresh); // ready for the next outage
    });
  }).catch(function (err) {
    log('could not load the photo, falling back to the plain URL', err && err.message);
    show(url); // last resort: let the browser try its own HTTP cache
  });
})();
