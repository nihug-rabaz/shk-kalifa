class BoardDataLoader {
  constructor() {
    this.boardId = window.BOARD_ID || '';
    this.apiBase = '/api/display/content';
    this.content = null;
    this.updateInterval = null;
    this.updatesRotationInterval = null;
    this.currentUpdateIndex = 0;
    this.yeshivaImageRotationInterval = null;
    this.yeshivaImageIndex = 0;
    this.hayadatImageRotationInterval = null;
    this.hayadatImageIndex = 0;
  }

  getBoardId() {
    return this.boardId;
  }

  async checkOnline() {
    if (!navigator.onLine) return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('/api/board-info?id=test', { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.status !== 0;
    } catch {
      return false;
    }
  }

  async loadContent() {
    try {
      const boardId = this.getBoardId();
      if (!boardId) {
        console.warn('No board ID available, cannot load content');
        return;
      }

      const contentKey = `shchakim_content_${boardId}`;
      const contentTimestampKey = `shchakim_content_timestamp_${boardId}`;
      
      const cachedContent = localStorage.getItem(contentKey);
      
      if (cachedContent) {
        try {
          const data = JSON.parse(cachedContent);
          this.content = data;
          await this.updateAll(data);
        } catch (e) {
          console.warn('Failed to parse cached content', e);
        }
      }
      
      const isOnline = await this.checkOnline();
      if (isOnline) {
        try {
          const ts = Date.now();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(`${this.apiBase}?boardId=${encodeURIComponent(boardId)}&t=${ts}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            this.content = data;
            localStorage.setItem(contentKey, JSON.stringify(data));
            localStorage.setItem(contentTimestampKey, Date.now().toString());
            
            await this.updateAll(data);
          }
        } catch (error) {
          console.warn('Error loading content from server:', error);
        }
      }
    } catch (error) {
      console.error('Error loading content:', error);
    }
  }

  updateBoardInfo(data) {
    if (!data?.boardInfo) return;

    const displayName = data.boardInfo.display_name || data.boardInfo.name || '';
    if (displayName) {
      const titleElement = document.querySelector('.text-wrapper-25');
      if (titleElement) {
        titleElement.textContent = `ברוכים הבאים ל${displayName}`;
      }
    }
  }

  updateTheme(data) {
    if (!data?.theme && !data?.background) return;

    const theme = data.theme || {};
    const background = data.background || {};
    const colors = background.colors || theme.gradient || [theme.primaryHex || '#0b3d2e', '#145a43'];
    
    if (colors && colors.length >= 2) {
      const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
      document.documentElement.style.setProperty('--theme-gradient', gradient);
      document.documentElement.style.setProperty('--theme-primary', colors[0]);
      document.documentElement.style.setProperty('--theme-secondary', colors[1]);
      
      // body.style.background = gradient; // מוערת - לא מעדכנים את הרקע
    }
  }

  async fetchZmanim(location) {
    if (!location || !location.latitude || !location.longitude) {
      return null;
    }

    try {
      const response = await fetch('/api/zmanim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          date: new Date().toISOString().slice(0, 10)
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.times || {};
      }
    } catch (error) {
      console.warn('Error fetching zmanim:', error);
    }
    return null;
  }

  calculateRelativeTime(relativeBase, offsetMinutes, zmanimTimes) {
    if (!relativeBase || !zmanimTimes) return null;

    const baseTime = zmanimTimes[relativeBase];
    if (!baseTime) return null;

    // המרת זמן ל-Date object
    const [hours, minutes] = baseTime.split(':').map(Number);
    const baseDate = new Date();
    baseDate.setHours(hours, minutes, 0, 0);

    // הוספת offset
    if (offsetMinutes) {
      baseDate.setMinutes(baseDate.getMinutes() + offsetMinutes);
    }

    // החזרת זמן בפורמט HH:MM
    return `${String(baseDate.getHours()).padStart(2, '0')}:${String(baseDate.getMinutes()).padStart(2, '0')}`;
  }

  async updatePrayerTimes(data) {
    console.log('[PRAYERS] Updating prayer times with data:', data);
    
    if (!data?.prayers || !Array.isArray(data.prayers)) {
      console.warn('[PRAYERS] No prayers data found');
      return;
    }

    console.log('[PRAYERS] Found prayers:', data.prayers.length);

    const prayerSection = document.querySelector('section.prayer-times-section');
    if (!prayerSection) {
      console.warn('[PRAYERS] prayer-times-section not found');
      return;
    }

    const prayerList = prayerSection.querySelector('ul');
    if (!prayerList) {
      console.warn('[PRAYERS] ul not found in prayer-times-section');
      return;
    }

    console.log('[PRAYERS] Prayer list found');

    // טעינת זמנים דינמיים אם יש location
    let zmanimTimes = null;
    if (data?.boardInfo?.location) {
      console.log('[PRAYERS] Fetching zmanim for location:', data.boardInfo.location);
      zmanimTimes = await this.fetchZmanim(data.boardInfo.location);
      console.log('[PRAYERS] Zmanim times received:', zmanimTimes);
    }

    // הצגת כל התפילות ללא סינון לפי יום השבוע
    let prayers = data.prayers;
    
    // אם יש תפילות כפולות (עם אותו שם), נשמור רק את הראשונה מכל סוג
    const seenPrayers = new Set();
    prayers = prayers.filter(p => {
      const title = (p.title || '').toLowerCase();
      if (title.includes('שחרית') || title.includes('shacharit')) {
        if (seenPrayers.has('shacharit')) return false;
        seenPrayers.add('shacharit');
        return true;
      } else if (title.includes('מנחה') || title.includes('mincha')) {
        const minchaCount = Array.from(seenPrayers).filter(k => k.startsWith('mincha')).length;
        if (minchaCount >= 2) return false;
        seenPrayers.add(`mincha${minchaCount}`);
        return true;
      } else if (title.includes('ערבית') || title.includes('arvit') || title.includes('maariv')) {
        if (seenPrayers.has('maariv')) return false;
        seenPrayers.add('maariv');
        return true;
      }
      return true;
    });

    console.log('[PRAYERS] All prayers (no day filter):', prayers.length, prayers);

    // ניקוי הרשימה הקיימת
    prayerList.innerHTML = '';

    // הפרדה לפי סוג תפילה
    const shacharitPrayers = [];
    const minchaPrayers = [];
    const maarivPrayers = [];

    for (const prayer of prayers) {
      const title = prayer.title || '';
      let time = '';
      
      // טיפול בזמנים - fixedTime או חישוב מ-relativeBase
      if (prayer.timeType === 'fixed' && prayer.fixedTime) {
        time = prayer.fixedTime;
        console.log(`[PRAYERS] Prayer ${title} - fixed time: ${time}`);
      } else if (prayer.timeType === 'relative' && prayer.relativeBase && zmanimTimes) {
        // חישוב זמן דינמי מ-relativeBase
        time = this.calculateRelativeTime(
          prayer.relativeBase,
          prayer.offsetMinutes || 0,
          zmanimTimes
        ) || prayer.fixedTime || '';
        console.log(`[PRAYERS] Prayer ${title} - relative time (${prayer.relativeBase}): ${time}`);
      } else if (prayer.timeType === 'relative' && !zmanimTimes) {
        console.warn(`[PRAYERS] Prayer ${title} requires zmanim but not available, using fixedTime: ${prayer.fixedTime}`);
        time = prayer.fixedTime || '';
      } else {
        time = prayer.fixedTime || '';
        console.log(`[PRAYERS] Prayer ${title} - fallback time: ${time}`);
      }
      
      if (!time) {
        console.warn(`[PRAYERS] No time found for prayer: ${title}`, prayer);
        continue;
      }
      
      const name = title.toLowerCase();
      
      if (name.includes('שחרית') || name.includes('shacharit')) {
        shacharitPrayers.push({ title, time, prayer });
      } else if (name.includes('מנחה') || name.includes('mincha')) {
        minchaPrayers.push({ title, time, prayer });
      } else if (name.includes('ערבית') || name.includes('arvit') || name.includes('maariv')) {
        maarivPrayers.push({ title, time, prayer });
      }
    }

    // הוספת שחרית (רק הראשונה)
    if (shacharitPrayers.length > 0) {
      const shacharit = shacharitPrayers[0];
      const li = document.createElement('li');
      li.className = 'text-wrapper-21';
      li.textContent = `שחרית ${shacharit.time}`;
      prayerList.appendChild(li);
      console.log(`[PRAYERS] Added shacharit: ${shacharit.time}`);
    }

    // הוספת מנחה (עד 2)
    minchaPrayers.slice(0, 2).forEach((mincha, index) => {
      const li = document.createElement('li');
      if (index === 0) {
        li.className = 'text-wrapper-22';
        li.textContent = `מנחה א' ${mincha.time}`;
        console.log(`[PRAYERS] Added mincha1: ${mincha.time}`);
      } else {
        li.className = 'text-wrapper-23';
        li.textContent = `מנחה ב' ${mincha.time}`;
        console.log(`[PRAYERS] Added mincha2: ${mincha.time}`);
      }
      prayerList.appendChild(li);
    });

    // הוספת ערבית (רק הראשונה)
    if (maarivPrayers.length > 0) {
      const maariv = maarivPrayers[0];
      const li = document.createElement('li');
      li.className = 'text-wrapper-24';
      li.textContent = `ערבית ${maariv.time}`;
      prayerList.appendChild(li);
      console.log(`[PRAYERS] Added maariv: ${maariv.time}`);
    }

    if (shacharitPrayers.length === 0) {
      console.warn('[PRAYERS] Shacharit not found in prayers');
    }
    if (minchaPrayers.length === 0) {
      console.warn('[PRAYERS] Mincha not found in prayers');
    }
    if (maarivPrayers.length === 0) {
      console.warn('[PRAYERS] Maariv not found in prayers');
    }
  }

  updateUpdates(data) {
    if (!data?.updates || !Array.isArray(data.updates)) return;

    // הפרדה בין סוגי עדכונים
    const hayadatUpdates = [];
    const yeshivaUpdates = []; // עדכוני "ימי ישיבה"
    const displayUpdates = []; // כל העדכונים להצגה ב-did-you-know-section

    data.updates.forEach(update => {
      const title = (update.title || update.name || '').toLowerCase();
      const type = (update.type || '').toLowerCase();
      
      // מזהה עדכוני "הידעת" בלבד
      if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
        hayadatUpdates.push(update);
      } 
      // מזהה עדכוני "ימי ישיבה"
      else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
        yeshivaUpdates.push(update);
      }
      // מזהה עדכונים להצגה: "עדכון כללי", "דתי", "מטכלי", "שיעורי תורה"
      else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') || 
               type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
        displayUpdates.push(update);
      }
    });

    // עדכון תמונת "ימי ישיבה" ב-safety-section עם החלפה אוטומטית
    if (yeshivaUpdates.length > 0) {
      const safetySection = document.querySelector('section.safety-section');
      if (safetySection) {
        const yeshivaImage = safetySection.querySelector('img');
        if (yeshivaImage) {
          this.displayYeshivaImagesWithRotation(yeshivaUpdates, yeshivaImage);
        }
      }
    }

    // עדכון פינת הידעת - כל העדכונים עם החלפה אוטומטית
    const hayadatSection = document.querySelector('section.did-you-know-section');
    if (hayadatSection) {
      // עדכון הטקסט - כל העדכונים (לא רק "שיעורי תורה")
      const hayadatContent = hayadatSection.querySelector('div.text-wrapper-27') || hayadatSection.querySelector('div[role="text"]') || hayadatSection.querySelector('div');
      if (hayadatContent) {
        // שילוב כל העדכונים להצגה
        const allDisplayUpdates = [...displayUpdates, ...yeshivaUpdates];
        if (allDisplayUpdates.length > 0) {
          this.displayUpdatesInDidYouKnow(allDisplayUpdates, hayadatContent);
        }
      }
      
      // עדכון התמונה - רק מעדכוני "הידעת" עם החלפה אוטומטית
      const hayadatImage = hayadatSection.querySelector('img');
      if (hayadatImage && hayadatUpdates.length > 0) {
        this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImage);
      }
    }
  }

  displayUpdatesInDidYouKnow(updates, contentElement) {
    if (!updates || updates.length === 0) return;
    if (!contentElement) return;

    // עצור את ה-timeout הקודם אם יש
    if (this.updatesRotationInterval) {
      clearTimeout(this.updatesRotationInterval);
    }

    // הצג את העדכון הראשון
    this.currentUpdateIndex = 0;
    this.showCurrentUpdateInDidYouKnow(updates, contentElement);

    // החלף עדכונים לפי displayTime של כל עדכון
    this.rotateToNextUpdateInDidYouKnow(updates, contentElement);
  }

  rotateToNextUpdateInDidYouKnow(updates, contentElement) {
    if (!updates || updates.length === 0) return;

    const currentUpdate = updates[this.currentUpdateIndex];
    if (!currentUpdate) return;

    const displayTime = (currentUpdate.displayTime || 20) * 1000; // המרה למילישניות

    // החלף לעדכון הבא אחרי displayTime שניות
    this.updatesRotationInterval = setTimeout(() => {
      this.currentUpdateIndex = (this.currentUpdateIndex + 1) % updates.length;
      this.showCurrentUpdateInDidYouKnow(updates, contentElement);
      this.rotateToNextUpdateInDidYouKnow(updates, contentElement); // המשך עם העדכון הבא
    }, displayTime);
  }

  showCurrentUpdateInDidYouKnow(updates, contentElement) {
    if (updates.length === 0) return;

    const currentUpdate = updates[this.currentUpdateIndex];
    if (!currentUpdate) return;

    const content = currentUpdate.content || currentUpdate.text || '';
    if (content) {
      contentElement.innerHTML = content.replace(/\n/g, '<br/>');
    }
  }

  displayYeshivaImagesWithRotation(updates, imageElement) {
    if (!updates || updates.length === 0 || !imageElement) return;

    if (this.yeshivaImageRotationInterval) {
      clearTimeout(this.yeshivaImageRotationInterval);
    }

    this.yeshivaImageIndex = 0;
    this.showCurrentYeshivaImage(updates, imageElement);
    this.rotateToNextYeshivaImage(updates, imageElement);
  }

  rotateToNextYeshivaImage(updates, imageElement) {
    if (!updates || updates.length === 0) return;

    const currentUpdate = updates[this.yeshivaImageIndex];
    if (!currentUpdate) return;

    const displayTime = (currentUpdate.displayTime || 20) * 1000;

    this.yeshivaImageRotationInterval = setTimeout(() => {
      this.yeshivaImageIndex = (this.yeshivaImageIndex + 1) % updates.length;
      this.showCurrentYeshivaImage(updates, imageElement);
      this.rotateToNextYeshivaImage(updates, imageElement);
    }, displayTime);
  }

  showCurrentYeshivaImage(updates, imageElement) {
    if (updates.length === 0) return;

    const currentUpdate = updates[this.yeshivaImageIndex];
    if (!currentUpdate) return;

    const imageUrl = currentUpdate.image || currentUpdate.imageUrl || currentUpdate.img || currentUpdate.background;
    if (imageUrl) {
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        imageElement.src = `/welcomfirst/img/${imageUrl}`;
      } else {
        imageElement.src = imageUrl;
      }
      imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה';
    }
  }

  displayHayadatImagesWithRotation(updates, imageElement) {
    if (!updates || updates.length === 0 || !imageElement) return;

    if (this.hayadatImageRotationInterval) {
      clearTimeout(this.hayadatImageRotationInterval);
    }

    this.hayadatImageIndex = 0;
    this.showCurrentHayadatImage(updates, imageElement);
    this.rotateToNextHayadatImage(updates, imageElement);
  }

  rotateToNextHayadatImage(updates, imageElement) {
    if (!updates || updates.length === 0) return;

    const currentUpdate = updates[this.hayadatImageIndex];
    if (!currentUpdate) return;

    const displayTime = (currentUpdate.displayTime || 20) * 1000;

    this.hayadatImageRotationInterval = setTimeout(() => {
      this.hayadatImageIndex = (this.hayadatImageIndex + 1) % updates.length;
      this.showCurrentHayadatImage(updates, imageElement);
      this.rotateToNextHayadatImage(updates, imageElement);
    }, displayTime);
  }

  showCurrentHayadatImage(updates, imageElement) {
    if (updates.length === 0) return;

    const currentUpdate = updates[this.hayadatImageIndex];
    if (!currentUpdate) return;

    const imageUrl = currentUpdate.image || currentUpdate.imageUrl || currentUpdate.img || currentUpdate.background;
    if (imageUrl) {
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        imageElement.src = `/welcomfirst/img/${imageUrl}`;
      } else {
        imageElement.src = imageUrl;
      }
      imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
    }
  }

  calculateTotalDisplayTime(updates) {
    if (!updates || updates.length === 0) return 60000;
    return updates.reduce((total, update) => {
      return total + ((update.displayTime || 20) * 1000);
    }, 0);
  }

  updateShuttleTimes(data) {
    // זמני שאטל - אם יש נתונים ספציפיים, עדכן אותם
    // כרגע זה נשאר סטטי כי אין שדה ספציפי ב-API
    // אם יגיעו נתונים, ניתן להוסיף כאן
  }

  async updateAll(data) {
    if (!data) return;
    
    this.updateBoardInfo(data);
    this.updateTheme(data);
    await this.updatePrayerTimes(data);
    this.updateUpdates(data);
    this.updateShuttleTimes(data);
    
    this.notifyParentOfDisplayTime(data);
  }

  notifyParentOfDisplayTime(data) {
    if (!data?.updates || !Array.isArray(data.updates)) return;

    const hayadatUpdates = [];
    const yeshivaUpdates = [];
    const displayUpdates = [];

    data.updates.forEach(update => {
      const title = (update.title || update.name || '').toLowerCase();
      const type = (update.type || '').toLowerCase();
      
      if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
        hayadatUpdates.push(update);
      } else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
        yeshivaUpdates.push(update);
      } else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') || 
                 type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
        displayUpdates.push(update);
      }
    });

    const allDisplayUpdates = [...displayUpdates, ...yeshivaUpdates];
    const totalTime = Math.max(
      this.calculateTotalDisplayTime(hayadatUpdates),
      this.calculateTotalDisplayTime(yeshivaUpdates),
      this.calculateTotalDisplayTime(allDisplayUpdates)
    );

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'BOARD_DISPLAY_TIME',
        totalTime: totalTime
      }, '*');
    }
  }

  setupPeriodicUpdates() {
    setInterval(async () => {
      const isOnline = await this.checkOnline();
      if (isOnline) {
        await this.loadContent();
      }
    }, 60000);
  }

  start() {
    this.loadContent();
    this.setupPeriodicUpdates();
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.updatesRotationInterval) {
      clearTimeout(this.updatesRotationInterval);
      this.updatesRotationInterval = null;
    }
    if (this.yeshivaImageRotationInterval) {
      clearTimeout(this.yeshivaImageRotationInterval);
      this.yeshivaImageRotationInterval = null;
    }
    if (this.hayadatImageRotationInterval) {
      clearTimeout(this.hayadatImageRotationInterval);
      this.hayadatImageRotationInterval = null;
    }
  }
}

function initializeBoardDataLoader() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const loader = new BoardDataLoader();
      loader.start();
      window.boardDataLoader = loader;
    });
  } else {
    const loader = new BoardDataLoader();
    loader.start();
    window.boardDataLoader = loader;
  }
}

initializeBoardDataLoader();
