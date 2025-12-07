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
    this.safetyRotationInterval = null;
    this.safetyUpdateIndex = 0;
    this.lastYeshivaUpdatesIds = null;
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
    let hasChanges = false;
    
    if (newData.boardInfo) {
      const boardInfoChanged = JSON.stringify(existing.boardInfo) !== JSON.stringify(newData.boardInfo);
      if (boardInfoChanged) {
        merged.boardInfo = { ...existing.boardInfo, ...newData.boardInfo };
        hasChanges = true;
      }
    }
    
    if (newData.theme) {
      const themeChanged = JSON.stringify(existing.theme) !== JSON.stringify(newData.theme);
      if (themeChanged) {
        merged.theme = { ...existing.theme, ...newData.theme };
        hasChanges = true;
      }
    }
    
    if (newData.background) {
      const backgroundChanged = JSON.stringify(existing.background) !== JSON.stringify(newData.background);
      if (backgroundChanged) {
        merged.background = { ...existing.background, ...newData.background };
        hasChanges = true;
      }
    }
    
    if (Array.isArray(newData.prayers)) {
      const prayersChanged = JSON.stringify(existing.prayers || []) !== JSON.stringify(newData.prayers);
      if (prayersChanged) {
        merged.prayers = newData.prayers;
        hasChanges = true;
      }
    }
    
    if (Array.isArray(newData.updates)) {
      const existingUpdates = existing.updates || [];
      const existingUpdatesMap = new Map();
      existingUpdates.forEach(u => {
        const key = u.id || u.title;
        if (key) existingUpdatesMap.set(key, u);
      });
      
      const newUpdatesMap = new Map();
      newData.updates.forEach(newUpdate => {
        const key = newUpdate.id || newUpdate.title;
        if (key) newUpdatesMap.set(key, newUpdate);
      });
      
      let updatesChanged = false;
      
      newData.updates.forEach(newUpdate => {
        const key = newUpdate.id || newUpdate.title;
        if (key && existingUpdatesMap.has(key)) {
          const existingUpdate = existingUpdatesMap.get(key);
          const existingImageUrl = existingUpdate.imageUrl || existingUpdate.image || existingUpdate.img;
          const newImageUrl = newUpdate.imageUrl || newUpdate.image || newUpdate.img;
          const imageUrlChanged = existingImageUrl !== newImageUrl;
          const updateChanged = JSON.stringify(existingUpdate) !== JSON.stringify(newUpdate) || imageUrlChanged;
          if (updateChanged) {
            existingUpdatesMap.set(key, { ...existingUpdate, ...newUpdate });
            updatesChanged = true;
          }
        } else if (key) {
          existingUpdatesMap.set(key, newUpdate);
          updatesChanged = true;
        }
      });
      
      const existingKeys = new Set(existingUpdatesMap.keys());
      const newKeys = new Set(newUpdatesMap.keys());
      const removedKeys = Array.from(existingKeys).filter(k => !newKeys.has(k));
      if (removedKeys.length > 0) {
        removedKeys.forEach(k => existingUpdatesMap.delete(k));
        updatesChanged = true;
      }
      
      if (updatesChanged || existingUpdates.length !== existingUpdatesMap.size) {
        merged.updates = Array.from(existingUpdatesMap.values());
        hasChanges = true;
      }
    }
    
    if (newData.shuttleTimes) {
      const shuttleChanged = JSON.stringify(existing.shuttleTimes || {}) !== JSON.stringify(newData.shuttleTimes);
      if (shuttleChanged) {
        merged.shuttleTimes = { ...existing.shuttleTimes, ...newData.shuttleTimes };
        hasChanges = true;
      }
    }
    
    merged._hasChanges = hasChanges;
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
            
            const hasChanges = mergedData._hasChanges;
            delete mergedData._hasChanges;
            
            this.content = mergedData;
            localStorage.setItem(contentKey, JSON.stringify(mergedData));
            localStorage.setItem(contentTimestampKey, Date.now().toString());
            
            if (hasChanges) {
              console.log('[ONLINE] Data changed, updating display');
              await this.updateAll(mergedData);
            } else {
              console.log('[ONLINE] No changes detected, skipping update');
            }
          } else {
            console.warn('[ONLINE] Server response not OK:', response.status);
            if (cachedData) {
              console.log('[FALLBACK] Using cached data due to server error');
              this.content = cachedData;
              await this.updateAll(cachedData);
            }
          }
        } catch (error) {
          console.warn('[ONLINE] Error loading content from server:', error);
          if (cachedData) {
            console.log('[FALLBACK] Using cached data due to connection error');
            this.content = cachedData;
            await this.updateAll(cachedData);
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

    const cacheKey = `zmanim_${location.latitude}_${location.longitude}_${new Date().toISOString().slice(0, 10)}`;
    
    try {
      const response = await fetch('/api/zmanim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: Math.abs(Number(location.longitude)),
          date: new Date().toISOString().slice(0, 10)
        })
      });

      if (response.ok) {
        const data = await response.json();
        const zmanimData = data.times || {};
        try {
          localStorage.setItem(cacheKey, JSON.stringify(zmanimData));
        } catch (e) {
          console.warn('Failed to cache zmanim:', e);
        }
        return zmanimData;
      }
    } catch (error) {
      console.warn('Error fetching zmanim:', error);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          console.warn('Failed to parse cached zmanim:', e);
        }
      }
    }
    return null;
  }

  calculateRelativeTime(relativeBase, offsetMinutes, zmanimTimes) {
    if (!relativeBase || !zmanimTimes) return null;

    const baseKeyMap = {
      stars_out: 'tzeit',
      stars_out_90: 'tzeit90',
      sunset: 'sunset'
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

    if (offsetMinutes) {
      minutes += offsetMinutes;
      if (minutes >= 60) {
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;
      } else if (minutes < 0) {
        hours += Math.floor(minutes / 60);
        minutes = ((minutes % 60) + 60) % 60;
      }
      if (hours >= 24) {
        hours = hours % 24;
      } else if (hours < 0) {
        hours = (hours % 24 + 24) % 24;
      }
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
        const keywordLower = locationKeyword ? locationKeyword.toLowerCase() : '';
        return keywordLower ? loc.includes(keywordLower) : true;
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
          const maarivCount = Array.from(seenPrayers).filter(k => k.startsWith('maariv')).length;
          if (maarivCount >= 2) return false;
          seenPrayers.add(`maariv${maarivCount}`);
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
          .filter(m => m.time && m.time.trim() !== '')
          .sort((a, b) => {
            const [ah, am] = (a.time || '').split(':').map(Number);
            const [bh, bm] = (b.time || '').split(':').map(Number);
            return (ah ?? 0) * 60 + (am ?? 0) - ((bh ?? 0) * 60 + (bm ?? 0));
          });

        const firstMaariv = sortedMaariv[0];
        if (firstMaariv) {
          const div = document.createElement('div');
          let suffix = (firstMaariv.location || '').includes('חמל רבצר') ? ' (חמל רבצר)' : '';
          // הוסף "(פלג)" אם השעה היא 15:45
          if (firstMaariv.time === '15:45') {
            suffix = ' (פלג)' + suffix;
          }
          div.className = 'text-wrapper-12';
          // אם יש רק ערבית אחת, לא לכתוב "א'"
          if (sortedMaariv.length === 1) {
            div.textContent = `ערבית ${firstMaariv.time}${suffix}`;
          } else {
            div.textContent = `ערבית א' ${firstMaariv.time}${suffix}`;
          }
          prayerList.appendChild(div);
        }

        if (sortedMaariv.length > 1) {
          const secondMaariv = sortedMaariv[1];
          const div2 = document.createElement('div');
          let suffix2 = (secondMaariv.location || '').includes('חמל רבצר') ? ' (חמל רבצר)' : '';
          // הוסף "(פלג)" אם השעה היא 15:45
          if (secondMaariv.time === '15:45') {
            suffix2 = ' (פלג)' + suffix2;
          }
          div2.className = 'text-wrapper-12';
          div2.textContent = `ערבית ב' ${secondMaariv.time}${suffix2}`;
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
      
      const rabbanutPrayersWithoutShacharit = rabbanutPrayers.filter(p => {
        const title = (p.title || '').toLowerCase();
        return !title.includes('שחרית') && !title.includes('shacharit');
      });
      
      const relativeMaariv = allPrayers.find(p => {
        const title = (p.title || '').toLowerCase();
        return (title.includes('ערבית') || title.includes('arvit') || title.includes('maariv')) &&
               p.timeType === 'relative' &&
               p.relativeBase === 'stars_out' &&
               !rabbanutPrayersWithoutShacharit.some(rp => rp.id === p.id);
      });
      
      if (relativeMaariv) {
        rabbanutPrayersWithoutShacharit.push(relativeMaariv);
      }
      
      updatePrayerSection(prayerSections[1], rabbanutPrayersWithoutShacharit);
    }
  }

  updateUpdates(data) {
    if (!data?.updates || !Array.isArray(data.updates)) {
      console.log('[UPDATES] No updates data available');
      return;
    }

    console.log('[UPDATES] Total updates received:', data.updates.length);

    // הפרדה בין סוגי עדכונים
    const hayadatUpdates = [];
    const yeshivaUpdates = []; // עדכוני "ימי ישיבה"
    const displayUpdates = []; // כל העדכונים להצגה ב-did-you-know-section
    const safetyUpdates = []; // עדכוני "דגשי בטיחות"

    data.updates.forEach(update => {
      const title = (update.title || update.name || '').toLowerCase();
      const type = (update.type || '').toLowerCase();
      
      console.log('[UPDATES] Processing update:', { title, type, imageUrl: update.imageUrl, image: update.image });
      
      // מזהה עדכוני "דגשי בטיחות"
      if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
        safetyUpdates.push(update);
        console.log('[UPDATES] Added to safetyUpdates:', update);
      }
      // מזהה עדכוני "הידעת" בלבד
      else if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
        hayadatUpdates.push(update);
        console.log('[UPDATES] Added to hayadatUpdates:', update);
      } 
      // מזהה עדכוני "ימי ישיבה"
      else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
        yeshivaUpdates.push(update);
        console.log('[UPDATES] Added to yeshivaUpdates:', update);
      }
      // מזהה עדכונים להצגה: "עדכון כללי", "דתי", "מטכלי", "שיעורי תורה"
      else if (type.includes('עדכון כללי') || type.includes('עדכון') || type.includes('דתי') || type.includes('מטכלי') || 
               type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
        displayUpdates.push(update);
        console.log('[UPDATES] Added to displayUpdates:', update);
      }
    });

    console.log('[UPDATES] Summary:', { hayadatUpdates: hayadatUpdates.length, yeshivaUpdates: yeshivaUpdates.length, displayUpdates: displayUpdates.length, safetyUpdates: safetyUpdates.length });

    // עדכון דגשי בטיחות עם גלילה אוטומטית
    const safetyContent = document.querySelector('.text-wrapper-15.safety-content');
    if (safetyContent) {
      if (safetyUpdates.length > 0) {
        console.log('[UPDATES] Updating safety content with', safetyUpdates.length, 'updates');
        this.displaySafetyUpdatesWithScrolling(safetyUpdates, safetyContent);
      } else {
        console.log('[UPDATES] No safety updates to display');
        safetyContent.textContent = '';
      }
    }

    // עדכון תמונת "ימי ישיבה" באזור הייעודי בעמוד welcome1
    const yeshivaImage = document.querySelector('.div-10 .element-dadfb-ec-b');
    console.log('[UPDATES] Yeshiva image element found:', !!yeshivaImage);
    if (yeshivaImage) {
      if (yeshivaUpdates.length > 0) {
        console.log('[UPDATES] Updating yeshiva image with', yeshivaUpdates.length, 'updates');
        this.displayYeshivaImagesWithRotation(yeshivaUpdates, yeshivaImage);
      } else {
        console.log('[UPDATES] No yeshiva updates to display');
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
    console.log('[UPDATES] Hayadat image element found:', !!hayadatImageWelcome1);
    if (hayadatImageWelcome1) {
      if (hayadatUpdates.length > 0) {
        console.log('[UPDATES] Updating hayadat image with', hayadatUpdates.length, 'updates');
        this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImageWelcome1);
      } else {
        console.log('[UPDATES] No hayadat updates to display');
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
      this.yeshivaImageRotationInterval = null;
    }

    const currentUpdatesIds = updates.map(u => `${u.id || u.title}:${u.imageUrl || u.image || u.img || ''}`).join('|');
    const lastUpdatesIds = this.lastYeshivaUpdatesIds || '';
    
    console.log('[YESHIVA-IMAGE] Current IDs:', currentUpdatesIds);
    console.log('[YESHIVA-IMAGE] Last IDs:', lastUpdatesIds);
    
    if (currentUpdatesIds !== lastUpdatesIds) {
      console.log('[YESHIVA-IMAGE] Updates changed, resetting rotation');
      this.lastYeshivaUpdatesIds = currentUpdatesIds;
      this.yeshivaImageIndex = 0;
      this.showCurrentYeshivaImage(updates, imageElement, true);
      this.rotateToNextYeshivaImage(updates, imageElement);
    } else {
      console.log('[YESHIVA-IMAGE] Updates unchanged, forcing image update');
      this.showCurrentYeshivaImage(updates, imageElement, true);
    }
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

  showCurrentYeshivaImage(updates, imageElement, forceUpdate = false) {
    if (updates.length === 0) {
      console.log('[YESHIVA-IMAGE] No updates to display');
      return;
    }

    const currentUpdate = updates[this.yeshivaImageIndex];
    if (!currentUpdate) {
      console.log('[YESHIVA-IMAGE] No current update at index', this.yeshivaImageIndex);
      return;
    }

    const imageUrl = currentUpdate.imageUrl || 
                     currentUpdate.image || 
                     currentUpdate.img || 
                     (currentUpdate.background && typeof currentUpdate.background === 'string' ? currentUpdate.background : null);
    
    if (imageUrl) {
      let finalUrl = '';
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        finalUrl = `/welcome1/img/${imageUrl}`;
      } else {
        finalUrl = imageUrl;
      }
      
      const currentSrc = imageElement.src.split('?')[0].split('&')[0];
      const newSrcBase = finalUrl.split('?')[0].split('&')[0];
      
      if (forceUpdate || currentSrc !== newSrcBase) {
        const timestamp = Date.now();
        let finalSrc = finalUrl;
        if (finalUrl.includes('?')) {
          if (finalUrl.endsWith('?')) {
            finalSrc = `${finalUrl}t=${timestamp}`;
          } else {
            finalSrc = `${finalUrl}&t=${timestamp}`;
          }
        } else {
          finalSrc = `${finalUrl}?t=${timestamp}`;
        }
        imageElement.src = finalSrc;
        imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה';
        console.log('[YESHIVA-IMAGE] Updated image to:', imageElement.src);
      }
    } else {
      console.warn('[YESHIVA-IMAGE] No imageUrl found in update');
    }
  }

  displayHayadatImagesWithRotation(updates, imageElement) {
    if (!updates || updates.length === 0 || !imageElement) return;

    if (this.hayadatImageRotationInterval) {
      clearTimeout(this.hayadatImageRotationInterval);
      this.hayadatImageRotationInterval = null;
    }

    this.hayadatImageIndex = 0;
    this.showCurrentHayadatImage(updates, imageElement, true);
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

  showCurrentHayadatImage(updates, imageElement, forceUpdate = false) {
    if (updates.length === 0) {
      console.log('[HAYADAT-IMAGE] No updates to display');
      return;
    }

    const currentUpdate = updates[this.hayadatImageIndex];
    if (!currentUpdate) {
      console.log('[HAYADAT-IMAGE] No current update at index', this.hayadatImageIndex);
      return;
    }

    const imageUrl = currentUpdate.imageUrl || 
                     currentUpdate.image || 
                     currentUpdate.img || 
                     (currentUpdate.background && typeof currentUpdate.background === 'string' ? currentUpdate.background : null);
    
    if (imageUrl) {
      let finalUrl = '';
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        finalUrl = `/welcome1/img/${imageUrl}`;
      } else {
        finalUrl = imageUrl;
      }
      
      const currentSrc = imageElement.src.split('?')[0].split('&')[0];
      const newSrcBase = finalUrl.split('?')[0].split('&')[0];
      
      if (forceUpdate || currentSrc !== newSrcBase) {
        const timestamp = Date.now();
        let finalSrc = finalUrl;
        if (finalUrl.includes('?')) {
          if (finalUrl.endsWith('?')) {
            finalSrc = `${finalUrl}t=${timestamp}`;
          } else {
            finalSrc = `${finalUrl}&t=${timestamp}`;
          }
        } else {
          finalSrc = `${finalUrl}?t=${timestamp}`;
        }
        imageElement.src = finalSrc;
        imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
        console.log('[HAYADAT-IMAGE] Updated image to:', imageElement.src);
      }
    } else {
      console.warn('[HAYADAT-IMAGE] No imageUrl found in update');
    }
  }

  displaySafetyUpdatesWithScrolling(updates, contentElement) {
    if (!updates || updates.length === 0 || !contentElement) return;

    if (this.safetyRotationInterval) {
      clearTimeout(this.safetyRotationInterval);
    }

    this.safetyUpdateIndex = 0;
    this.showCurrentSafetyUpdate(updates, contentElement);
    this.rotateToNextSafetyUpdate(updates, contentElement);
  }

  rotateToNextSafetyUpdate(updates, contentElement) {
    if (!updates || updates.length === 0) return;

    const currentUpdate = updates[this.safetyUpdateIndex];
    if (!currentUpdate) return;

    const displayTime = (currentUpdate.displayTime || 20) * 1000;

    this.safetyRotationInterval = setTimeout(() => {
      this.safetyUpdateIndex = (this.safetyUpdateIndex + 1) % updates.length;
      this.showCurrentSafetyUpdate(updates, contentElement);
      this.rotateToNextSafetyUpdate(updates, contentElement);
    }, displayTime);
  }

  showCurrentSafetyUpdate(updates, contentElement) {
    if (updates.length === 0) return;

    const currentUpdate = updates[this.safetyUpdateIndex];
    if (!currentUpdate) return;

    const content = currentUpdate.content || currentUpdate.text || currentUpdate.title || currentUpdate.name;
    if (content) {
      contentElement.innerHTML = content.replace(/\n/g, '<br/>');
    }
  }

  updateMainAnnouncement(data) {
    if (!data?.updates || !Array.isArray(data.updates)) return;

    const candidates = data.updates.filter(update => {
      const type = (update.type || '').toLowerCase();
      return (
        type.includes('עדכון כללי') ||
        type.includes('עדכון') ||
        type.includes('דתי') ||
        type.includes('מטכלי') ||
        type.includes('שיעורי תורה')
      );
    });

    console.log('[ANNOUNCEMENT] Found', candidates.length, 'updates to display');
    console.log('[ANNOUNCEMENT] Updates:', candidates);

    const target = document.querySelector('.element-3');
    if (!target) {
      console.warn('[ANNOUNCEMENT] element-3 not found');
      return;
    }
    
    if (candidates.length === 0) {
      console.warn('[ANNOUNCEMENT] No updates to display');
      return;
    }

    // שילוב כל העדכונים עם הפרדה
    const allContent = candidates
      .map(update => {
        const content = update.content || update.text || update.title || update.name;
        return content;
      })
      .filter(Boolean)
      .join('<br/><br/>---<br/><br/>');
    
    if (allContent) {
      console.log('[ANNOUNCEMENT] Setting content:', allContent);
      target.innerHTML = allContent.replace(/\n/g, '<br/>');
    } else {
      console.warn('[ANNOUNCEMENT] No content to display');
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
    if (!data) {
      console.warn('[UPDATE] No data provided to updateAll');
      return;
    }
    
    try {
      this.updateBoardInfo(data);
      this.updateTheme(data);
      await this.updatePrayerTimes(data);
      this.updateUpdates(data);
      this.updateShuttleTimes(data);
      this.updateMainAnnouncement(data);
      
      this.notifyParentOfDisplayTime(data);
      
      const boardId = this.getBoardId();
      if (boardId) {
        const contentKey = `shchakim_content_${boardId}`;
        try {
          localStorage.setItem(contentKey, JSON.stringify(data));
          localStorage.setItem(`shchakim_content_timestamp_${boardId}`, Date.now().toString());
        } catch (e) {
          console.warn('[UPDATE] Failed to save data to localStorage:', e);
        }
      }
    } catch (error) {
      console.error('[UPDATE] Error in updateAll:', error);
      const boardId = this.getBoardId();
      if (boardId) {
        const contentKey = `shchakim_content_${boardId}`;
        try {
          localStorage.setItem(contentKey, JSON.stringify(data));
        } catch (e) {
          console.warn('[UPDATE] Failed to save data to localStorage after error:', e);
        }
      }
    }
  }

  notifyParentOfDisplayTime(data) {
    if (!data?.updates || !Array.isArray(data.updates)) return;

    const hayadatUpdates = [];
    const yeshivaUpdates = [];
    const displayUpdates = [];
    const safetyUpdates = [];

    data.updates.forEach(update => {
      const title = (update.title || update.name || '').toLowerCase();
      const type = (update.type || '').toLowerCase();
      
      if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
        safetyUpdates.push(update);
      } else if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
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
      this.calculateTotalDisplayTime(allDisplayUpdates),
      this.calculateTotalDisplayTime(safetyUpdates)
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
    }, 30000);
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
    if (this.safetyRotationInterval) {
      clearTimeout(this.safetyRotationInterval);
      this.safetyRotationInterval = null;
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
