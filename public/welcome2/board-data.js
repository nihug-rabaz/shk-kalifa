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
          longitude: Math.abs(Number(location.longitude)),
          date: new Date().toISOString().slice(0, 10)
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data || null;
      }
    } catch (error) {
      console.warn('Error fetching zmanim:', error);
    }
    return null;
  }

  calculateRelativeTime(relativeBase, offsetMinutes, zmanimTimes) {
    if (!relativeBase || !zmanimTimes) return null;

    const baseTime = (zmanimTimes.times || zmanimTimes)[relativeBase];
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
    console.log('[PRAYERS] Welcome2 has no prayer section, skipping');
    await this.updateHalacha(data);
  }

  async updateHalacha(data) {
    try {
      const response = await fetch('/api/halacha/daily');
      if (response.ok) {
        const halachaData = await response.json();
        const halachaItems = halachaData.items || [];
        
        if (halachaItems.length > 0) {
          const halachaContainer = document.querySelector('.div-wrapper-3');
          if (halachaContainer) {
            // נוודא שיש <p> בפנים, ואם לא - ניצור אחד
            let halachaContent = halachaContainer.querySelector('p.text-wrapper-10');
            if (!halachaContent) {
              halachaContent = document.createElement('p');
              halachaContent.className = 'text-wrapper-10 sliding-text';
              halachaContainer.appendChild(halachaContent);
            } else {
              // ודא שיש גם את קלאס האנימציה
              if (!halachaContent.classList.contains('sliding-text')) {
                halachaContent.classList.add('sliding-text');
              }
            }

            const combined = halachaItems
              .slice(0, 2)
              .map(item => item.summary || item.text || item.content || '')
              .filter(Boolean)
              .join('<br/><br/>');
            
            if (combined) {
              halachaContent.innerHTML = combined;
            }
          }
        }

        // עדכון כותרת האגרת לפי פרשת השבוע מהזמנים
        try {
          const location = data?.boardInfo?.location;
          if (location && location.latitude && location.longitude) {
            const zmanim = await this.fetchZmanim(location);
            if (zmanim) {
              const parasha =
                zmanim.parasha ||
                zmanim.parsha ||
                zmanim.torahPortion ||
                (zmanim.hebrew && zmanim.hebrew.parasha);
              if (parasha) {
                const titleElement = document.querySelector('.div-2 .div-wrapper .p');
                if (titleElement) {
                  titleElement.textContent = `אגרת רבצ\"ר - פרשת ${parasha}`;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[PARASHA] Failed to update parasha title', e);
        }
      }
    } catch (error) {
      console.warn('[HALACHA] Error updating halacha:', error);
    }
  

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

    console.log('[PRAYERS] Welcome2 does not display prayers, skipping prayer list update');
  }

  updateUpdates(data) {
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
      }
      else if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
        hayadatUpdates.push(update);
      } 
      else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
        yeshivaUpdates.push(update);
      }
      else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') || 
               type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
        displayUpdates.push(update);
      }
    });

    const safetyContent = document.querySelector('.text-wrapper-15.safety-content');
    if (safetyContent) {
      if (safetyUpdates.length > 0) {
        this.displaySafetyUpdatesWithScrolling(safetyUpdates, safetyContent);
      }
    }

    // עדכון תמונת "ימי ישיבה" ב-safety-section עם החלפה אוטומטית
    if (yeshivaUpdates.length > 0) {
      const safetySection = document.querySelector('section.safety-section');
      if (safetySection) {
        const yeshivaImage = safetySection.querySelector('img');
        if (yeshivaImage) {
          this.displayYeshivaImagesWithRotation(yeshivaUpdates, yeshivaImage);
        }
      }
    } else {
      const safetySection = document.querySelector('section.safety-section');
      if (safetySection) {
        const yeshivaImage = safetySection.querySelector('img');
        if (yeshivaImage && this.yeshivaImageRotationInterval) {
          clearTimeout(this.yeshivaImageRotationInterval);
          this.yeshivaImageRotationInterval = null;
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
      this.yeshivaImageRotationInterval = null;
    }

    this.yeshivaImageIndex = 0;
    this.showCurrentYeshivaImage(updates, imageElement, true);
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

  showCurrentYeshivaImage(updates, imageElement, forceUpdate = false) {
    if (updates.length === 0) return;

    const currentUpdate = updates[this.yeshivaImageIndex];
    if (!currentUpdate) return;

    const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
    if (imageUrl) {
      let finalUrl = '';
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        let basePath = '/welcome2';
        const existingImg = document.querySelector('section.safety-section img, section.yeshiva-days-section img');
        if (existingImg && existingImg.src) {
          const match = existingImg.src.match(/\/(welcome[123])\//);
          if (match) {
            basePath = `/${match[1]}`;
          }
        } else if (imageElement.src) {
          const match = imageElement.src.match(/\/(welcome[123])\//);
          if (match) {
            basePath = `/${match[1]}`;
          }
        }
        finalUrl = `${basePath}/img/${imageUrl}`;
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
      }
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

    const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
    if (imageUrl) {
      let finalUrl = '';
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        let basePath = '/welcome2';
        const existingImg = document.querySelector('section.did-you-know-section img');
        if (existingImg && existingImg.src) {
          const match = existingImg.src.match(/\/(welcome[123])\//);
          if (match) {
            basePath = `/${match[1]}`;
          }
        } else if (imageElement.src) {
          const match = imageElement.src.match(/\/(welcome[123])\//);
          if (match) {
            basePath = `/${match[1]}`;
          }
        }
        finalUrl = `${basePath}/img/${imageUrl}`;
      } else {
        finalUrl = imageUrl;
      }
      
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
    const safetyUpdates = [];

    data.updates.forEach(update => {
      const title = (update.title || update.name || '').toLowerCase();
      const type = (update.type || '').toLowerCase();
      
      if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
        safetyUpdates.push(update);
      }
      else if (title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
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
