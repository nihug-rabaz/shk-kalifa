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

  mergeData(existing, newData) {
    if (!existing) return newData;
    if (!newData) return existing;
    
    const merged = { ...existing };
    
    if (newData.boardInfo) {
      merged.boardInfo = { ...existing.boardInfo, ...newData.boardInfo };
    }
    
    if (newData.theme) {
      merged.theme = { ...existing.theme, ...newData.theme };
    }
    
    if (newData.background) {
      merged.background = { ...existing.background, ...newData.background };
    }
    
    if (Array.isArray(newData.prayers)) {
      merged.prayers = newData.prayers;
    }
    
    if (Array.isArray(newData.updates)) {
      const existingUpdateIds = new Set((existing.updates || []).map(u => u.id || u.title));
      const newUpdates = newData.updates.filter(u => !existingUpdateIds.has(u.id || u.title));
      merged.updates = [...(existing.updates || []), ...newUpdates];
    }
    
    if (newData.shuttleTimes) {
      merged.shuttleTimes = { ...existing.shuttleTimes, ...newData.shuttleTimes };
    }
    
    return merged;
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
      
      let cachedData = null;
      const cachedContent = localStorage.getItem(contentKey);
      
      if (cachedContent) {
        try {
          cachedData = JSON.parse(cachedContent);
          this.content = cachedData;
          await this.updateAll(cachedData);
          console.log('[CACHE] Loaded content from local storage');
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
            const newData = await response.json();
            const mergedData = this.mergeData(cachedData, newData);
            
            this.content = mergedData;
            localStorage.setItem(contentKey, JSON.stringify(mergedData));
            localStorage.setItem(contentTimestampKey, Date.now().toString());
            
            console.log('[ONLINE] Loaded and merged content from server');
            await this.updateAll(mergedData);
          } else {
            console.warn('[ONLINE] Server response not OK:', response.status);
            if (cachedData) {
              console.log('[FALLBACK] Using cached data due to server error');
            }
          }
        } catch (error) {
          console.warn('[ONLINE] Error loading content from server:', error);
          if (cachedData) {
            console.log('[FALLBACK] Using cached data due to connection error');
          }
        }
      } else {
        console.log('[OFFLINE] No connection, using cached data');
        if (cachedData) {
          await this.updateAll(cachedData);
        }
      }
    } catch (error) {
      console.error('Error loading content:', error);
      const boardId = this.getBoardId();
      if (boardId) {
        const contentKey = `shchakim_content_${boardId}`;
        const cachedContent = localStorage.getItem(contentKey);
        if (cachedContent) {
          try {
            const data = JSON.parse(cachedContent);
            this.content = data;
            await this.updateAll(data);
            console.log('[FALLBACK] Using cached data after error');
          } catch (e) {
            console.error('Failed to load cached data after error:', e);
          }
        }
      }
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
          longitude: "-"+location.longitude,
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

    const baseKeyMap = {
      stars_out: 'tzait',
      stars_out_90: 'tzait90',
      sunset: 'shkiya'
    };

    const key = baseKeyMap[relativeBase] || relativeBase;
    const raw = zmanimTimes[key];
    if (!raw) return null;

    let hours = 0;
    let minutes = 0;

    if (typeof raw === 'string') {
      const timePart = raw.includes('T') ? raw.split('T')[1] : raw;
      const [h, m] = timePart.split(':');
      hours = Number(h) || 0;
      minutes = Number(m) || 0;
    }

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

    const prayerSections = document.querySelectorAll('.div-8');
    if (prayerSections.length === 0) {
      console.warn('[PRAYERS] Prayer sections not found');
      return;
    }

    console.log('[PRAYERS] Found', prayerSections.length, 'prayer sections');

    // טעינת זמנים דינמיים אם יש location
    let zmanimTimes = null;
    if (data?.boardInfo?.location) {
      console.log('[PRAYERS] Fetching zmanim for location:', data.boardInfo.location);
      zmanimTimes = await this.fetchZmanim(data.boardInfo.location);
      console.log('[PRAYERS] Zmanim times received:', zmanimTimes);
    }

    // הצגת תפילות לפי בית כנסת
    const allPrayers = data.prayers;

    const filterPrayersByLocation = (locationKeyword) => {
      const prayers = allPrayers.filter(p => {
        const loc = (p.location || '').toLowerCase();
        return locationKeyword ? loc.includes(locationKeyword) : true;
      });

      const seenPrayers = new Set();
      return prayers.filter(p => {
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
    };

    const updatePrayerSection = (prayerContainer, prayers) => {
      const prayerList = prayerContainer.querySelector('.div-9');
      if (!prayerList) {
        console.warn('[PRAYERS] div-9 not found in prayer section');
        return;
      }

      prayerList.innerHTML = '';

      const shacharitPrayers = [];
      const minchaPrayers = [];
      const maarivPrayers = [];

      for (const prayer of prayers) {
        const title = prayer.title || '';
        let time = '';
        
        if (prayer.timeType === 'fixed' && prayer.fixedTime) {
          time = prayer.fixedTime;
        } else if (prayer.timeType === 'relative' && prayer.relativeBase && zmanimTimes) {
          time = this.calculateRelativeTime(
            prayer.relativeBase,
            prayer.offsetMinutes || 0,
            zmanimTimes
          ) || prayer.fixedTime || '';
        } else if (prayer.timeType === 'relative' && !zmanimTimes) {
          if (prayer.fixedTime) {
            time = prayer.fixedTime;
          } else {
            const fallbackMaariv = allPrayers.find(p => {
              const t = (p.title || '').toLowerCase();
              return (t.includes('ערבית') || t.includes('arvit') || t.includes('maariv')) &&
                     p.timeType === 'fixed' &&
                     p.fixedTime;
            });
            time = fallbackMaariv?.fixedTime || '';
          }
        } else {
          time = prayer.fixedTime || '';
        }
        
        const name = title.toLowerCase();
        const location = prayer.location || '';
        
        if (name.includes('שחרית') || name.includes('shacharit')) {
          shacharitPrayers.push({ title, time, prayer, location });
        } else if (name.includes('מנחה') || name.includes('mincha')) {
          minchaPrayers.push({ title, time, prayer, location });
        } else if (name.includes('ערבית') || name.includes('arvit') || name.includes('maariv')) {
          maarivPrayers.push({ title, time, prayer, location });
        }
      }

      if (shacharitPrayers.length > 0) {
        const shacharit = shacharitPrayers[0];
        const div = document.createElement('div');
        div.className = 'text-wrapper-10';
        div.textContent = `שחרית ${shacharit.time}`;
        prayerList.appendChild(div);
      }

      minchaPrayers
        .filter(m => m.time)
        .sort((a, b) => {
          const [ah, am] = (a.time || '').split(':').map(Number);
          const [bh, bm] = (b.time || '').split(':').map(Number);
          return (ah ?? 0) * 60 + (am ?? 0) - ((bh ?? 0) * 60 + (bm ?? 0));
        })
        .slice(0, 2)
        .forEach((mincha, index) => {
        const div = document.createElement('div');
        div.className = index === 0 ? 'text-wrapper-11' : 'text-wrapper-11';
          const suffix = (mincha.location || '').includes('חמל רבצר') ? ' (חמל רבצר)' : '';
          div.textContent = index === 0
            ? `מנחה א' ${mincha.time}${suffix}`
            : `מנחה ב' ${mincha.time}${suffix}`;
        prayerList.appendChild(div);
      });

      if (maarivPrayers.length > 0) {
        const sortedMaariv = maarivPrayers
          .filter(m => m.time)
          .sort((a, b) => {
            const [ah, am] = (a.time || '').split(':').map(Number);
            const [bh, bm] = (b.time || '').split(':').map(Number);
            return (ah ?? 0) * 60 + (am ?? 0) - ((bh ?? 0) * 60 + (bm ?? 0));
          });

        const firstMaariv = sortedMaariv[0];
        if (firstMaariv) {
          const div = document.createElement('div');
          const suffix = (firstMaariv.location || '').includes('חמל רבצר') ? ' (חמל רבצר)' : '';
          div.className = 'text-wrapper-12';
          div.textContent = `ערבית א ${firstMaariv.time}${suffix}`;
          prayerList.appendChild(div);
        }

        if (sortedMaariv.length > 1) {
          const secondMaariv = sortedMaariv[1];
          const div2 = document.createElement('div');
          const suffix2 = (secondMaariv.location || '').includes('חמל רבצר') ? ' (חמל רבצר)' : '';
          div2.className = 'text-wrapper-12';
          div2.textContent = `ערבית ב ${secondMaariv.time}${suffix2}`;
          prayerList.appendChild(div2);
        }
      }
    };

    if (prayerSections.length > 0) {
      const centralPrayers = filterPrayersByLocation('בית כנסת מרכזי');
      updatePrayerSection(prayerSections[0], centralPrayers);
    }

    if (prayerSections.length > 1) {
      const rabbanutPrayers = [
        ...filterPrayersByLocation('בית כנסת רבנות'),
        ...filterPrayersByLocation('חמל רבצר')
      ];
      updatePrayerSection(prayerSections[1], rabbanutPrayers);
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

    // עדכון תמונת "ימי ישיבה" באזור הייעודי בעמוד welcome1
    if (yeshivaUpdates.length > 0) {
      const yeshivaImage = document.querySelector('.div-10 .element-dadfb-ec-b');
      if (yeshivaImage) {
        this.displayYeshivaImagesWithRotation(yeshivaUpdates, yeshivaImage);
      }
    }

    // עדכון פינת הידעת - טקסט + תמונה
    const hayadatSection = document.querySelector('section.did-you-know-section');
    if (hayadatSection) {
      // עדכון טקסט עבור מבנים שכוללים section.did-you-know-section
      const hayadatContent = hayadatSection.querySelector('div.text-wrapper-27') || hayadatSection.querySelector('div[role="text"]') || hayadatSection.querySelector('div');
      if (hayadatContent) {
        const allDisplayUpdates = [...displayUpdates, ...yeshivaUpdates];
        if (allDisplayUpdates.length > 0) {
          this.displayUpdatesInDidYouKnow(allDisplayUpdates, hayadatContent);
        }
      }
      
      const hayadatImage = hayadatSection.querySelector('img');
      if (hayadatImage && hayadatUpdates.length > 0) {
        this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImage);
      }
    }

    // בעמוד welcome1 - התמונה של "פינת הידעת?" נמצאת בתוך div-11 > div:first-child > img.img
    const hayadatImageWelcome1 = document.querySelector('.div-11 .img');
    if (hayadatImageWelcome1 && hayadatUpdates.length > 0) {
      this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImageWelcome1);
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
        imageElement.src = `/welcome1/img/${imageUrl}`;
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
        imageElement.src = `/welcome1/img/${imageUrl}`;
      } else {
        imageElement.src = imageUrl;
      }
      imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
    }
  }

  updateMainAnnouncement(data) {
    if (!data?.updates || !Array.isArray(data.updates)) return;

    const candidates = data.updates.filter(update => {
      const type = (update.type || '').toLowerCase();
      return (
        type.includes('עדכון כללי') ||
        type.includes('דתי') ||
        type.includes('מטכלי') ||
        type.includes('שיעורי תורה')
      );
    });

    const target = document.querySelector('.element-3');
    if (!target || candidates.length === 0) return;

    const latest = candidates[candidates.length - 1];
    const content = latest.content || latest.text || latest.title || latest.name;
    if (content) {
      target.innerHTML = content.replace(/\n/g, '<br/>');
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
    this.updateMainAnnouncement(data);
    
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
    this.updateInterval = setInterval(async () => {
      await this.loadContent();
    }, 60000);
  }

  setupOnlineOfflineListeners() {
    window.addEventListener('online', async () => {
      console.log('[NETWORK] Connection restored, reloading content');
      await this.loadContent();
    });

    window.addEventListener('offline', () => {
      console.log('[NETWORK] Connection lost, using cached data');
      const boardId = this.getBoardId();
      if (boardId) {
        const contentKey = `shchakim_content_${boardId}`;
        const cachedContent = localStorage.getItem(contentKey);
        if (cachedContent) {
          try {
            const data = JSON.parse(cachedContent);
            this.content = data;
            this.updateAll(data);
            console.log('[OFFLINE] Loaded content from cache');
          } catch (e) {
            console.warn('[OFFLINE] Failed to load cached content:', e);
          }
        }
      }
    });
  }

  start() {
    this.loadContent();
    this.setupPeriodicUpdates();
    this.setupOnlineOfflineListeners();
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
