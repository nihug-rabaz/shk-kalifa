;(function () {
  'use strict';

  class HolidayBoardController {
    constructor(config) {
      this.startDate = config.startDate;
      this.endDate = config.endDate;
      this.containerSelector = config.containerSelector || 'body';
    }

    normalizeDate(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    isInRange(date) {
      const current = this.normalizeDate(date);
      const start = this.normalizeDate(this.startDate);
      const end = this.normalizeDate(this.endDate);
      return current >= start && current <= end;
    }

    apply(asOfDate) {
      const now = asOfDate ? new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate()) : new Date();
      if (!this.isInRange(now)) {
        return;
      }
      let boardBase = null;
      try {
        const url = new URL(window.location.href);
        const boardParam = url.searchParams.get('board');
        if (boardParam === '1') {
          boardBase = '/welcome1';
        } else if (boardParam === '2') {
          boardBase = '/welcome2';
        } else {
          const path = url.pathname || '';
          if (path.indexOf('/welcome1') !== -1) {
            boardBase = '/welcome1';
          } else if (path.indexOf('/welcome2') !== -1) {
            boardBase = '/welcome2';
          }
        }
      } catch (e) {
        const path = window.location.pathname || '';
        if (path.indexOf('/welcome1') !== -1) {
          boardBase = '/welcome1';
        } else if (path.indexOf('/welcome2') !== -1) {
          boardBase = '/welcome2';
        }
      }
      if (!boardBase) {
        return;
      }
      const bgImage = document.querySelector('.frame .element');
      if (!bgImage || !(bgImage instanceof HTMLImageElement)) {
        return;
      }
      const originalSrc = bgImage.getAttribute('data-original-src') || bgImage.getAttribute('src');
      if (originalSrc && !bgImage.getAttribute('data-original-src')) {
        bgImage.setAttribute('data-original-src', originalSrc);
      }
      bgImage.src = `${boardBase}/img/purim.png`;
    }
  }

  function parseYYYYMMDD(s) {
    const parts = String(s).split('-').map(Number);
    if (parts.length !== 3) return null;
    const y = parts[0], m = parts[1] - 1, d = parts[2];
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m, d);
  }

  function applyWithRange(range, asOfDate) {
    const start = parseYYYYMMDD(range.start);
    const end = parseYYYYMMDD(range.end);
    if (!start || !end) return;
    const controller = new HolidayBoardController({
      startDate: start,
      endDate: end,
      containerSelector: '.frame'
    });
    controller.apply(asOfDate);
  }

  function getTestDate() {
    try {
      const url = new URL(window.location.href);
      const testParam = url.searchParams.get('purim_test');
      if (!testParam) return null;
      return parseYYYYMMDD(testParam);
    } catch (e) {
      return null;
    }
  }

  function initHolidayBoard() {
    const testDate = getTestDate();
    if (testDate) {
      fetch('/api/purim-range?date=' + testDate.getFullYear() + '-' + String(testDate.getMonth() + 1).padStart(2, '0') + '-' + String(testDate.getDate()).padStart(2, '0'))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (range) {
          if (range && range.start && range.end && range.inRange) {
            applyWithRange(range, testDate);
          }
        })
        .catch(function () {});
      return;
    }
    if (window.PURIM_RANGE && window.PURIM_RANGE.start && window.PURIM_RANGE.end) {
      applyWithRange(window.PURIM_RANGE);
      return;
    }
    fetch('/api/purim-range')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (range) {
        if (range && range.start && range.end) {
          applyWithRange(range);
        }
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHolidayBoard);
  } else {
    initHolidayBoard();
  }
})();
