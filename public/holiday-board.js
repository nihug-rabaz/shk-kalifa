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

    apply() {
      const now = new Date();
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

  function initHolidayBoard() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), 2, 4);
    const controller = new HolidayBoardController({
      imageSrc: 'img/purim.png',
      startDate: now,
      endDate: endDate,
      containerSelector: '.frame'
    });
    controller.apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHolidayBoard);
  } else {
    initHolidayBoard();
  }
})();

