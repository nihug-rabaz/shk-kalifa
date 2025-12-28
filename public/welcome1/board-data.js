(function() {
  'use strict';

  function safeLog(...args) {
    try {
      if (console && typeof console.log === 'function') {
        console.log(...args);
      }
    } catch (e) {
    }
  }

  function safeWarn(...args) {
    try {
      if (console && typeof console.warn === 'function') {
        console.warn(...args);
      }
    } catch (e) {
    }
  }

  function safeError(...args) {
    try {
      if (console && typeof console.error === 'function') {
        console.error(...args);
      }
    } catch (e) {
    }
  }

  window.addEventListener('error', (event) => {
    safeError('[GLOBAL-ERROR]', event.error || event.message, event.filename, event.lineno);
    event.preventDefault();
  });

  window.addEventListener('unhandledrejection', (event) => {
    safeError('[GLOBAL-REJECTION]', event.reason);
    event.preventDefault();
  });

  class LRUCache {
    constructor(maxSize = 50) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }

    get(key) {
      if (!this.cache.has(key)) return null;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    has(key) {
      return this.cache.has(key);
    }

    delete(key) {
      return this.cache.delete(key);
    }

    clear() {
      this.cache.clear();
    }
  }

  class ImageCacheManager {
    constructor() {
      this.dbName = 'ImageCacheDB';
      this.dbVersion = 1;
      this.storeName = 'images';
      this.db = null;
      this.objectUrls = new Map();
      this.initRetries = 0;
      this.maxRetries = 3;
    }

    async init() {
      if (this.db) return;
      if (this.initRetries >= this.maxRetries) {
        safeWarn('[IMAGECACHE] Max retries reached, using fallback');
        return;
      }
      return new Promise((resolve, reject) => {
        try {
          const request = indexedDB.open(this.dbName, this.dbVersion);
          request.onerror = () => {
            this.initRetries++;
            safeWarn('[IMAGECACHE] Init error:', request.error);
            reject(request.error);
          };
          request.onsuccess = () => {
            this.db = request.result;
            this.initRetries = 0;
            resolve();
          };
          request.onupgradeneeded = (event) => {
            try {
              const db = event.target.result;
              if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName);
              }
            } catch (e) {
              safeError('[IMAGECACHE] Upgrade error:', e);
            }
          };
        } catch (e) {
          this.initRetries++;
          safeError('[IMAGECACHE] Init exception:', e);
          reject(e);
        }
      });
    }

    revokeObjectUrl(url) {
      if (url && this.objectUrls.has(url)) {
        try {
          URL.revokeObjectURL(url);
          this.objectUrls.delete(url);
        } catch (e) {
          safeWarn('[IMAGECACHE] Error revoking URL:', e);
        }
      }
    }

    createObjectUrl(blob) {
      try {
        const url = URL.createObjectURL(blob);
        this.objectUrls.set(url, true);
        return url;
      } catch (e) {
        safeError('[IMAGECACHE] Error creating object URL:', e);
        return null;
      }
    }

    async getImageUrl(url) {
      try {
        await this.init();
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            request.onsuccess = () => {
              const blob = request.result;
              if (blob) {
                const cachedUrl = this.createObjectUrl(blob);
                resolve(cachedUrl);
              } else {
                resolve(null);
              }
            };
            request.onerror = () => {
              safeWarn('[IMAGECACHE] Get error:', request.error);
              reject(request.error);
            };
          } catch (e) {
            safeError('[IMAGECACHE] Transaction error:', e);
            reject(e);
          }
        });
      } catch (e) {
        safeError('[IMAGECACHE] GetImageUrl error:', e);
        return null;
      }
    }

    async saveImage(url, blob) {
      try {
        await this.init();
        if (!this.db) return;
        return new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(blob, url);
            request.onsuccess = () => resolve();
            request.onerror = () => {
              safeWarn('[IMAGECACHE] Save error:', request.error);
              reject(request.error);
            };
          } catch (e) {
            safeError('[IMAGECACHE] Save transaction error:', e);
            reject(e);
          }
        });
      } catch (e) {
        safeError('[IMAGECACHE] SaveImage error:', e);
      }
    }

    async hasImage(url) {
      try {
        await this.init();
        if (!this.db) return false;
        return new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => {
              safeWarn('[IMAGECACHE] Has error:', request.error);
              reject(request.error);
            };
          } catch (e) {
            safeError('[IMAGECACHE] Has transaction error:', e);
            reject(e);
          }
        });
      } catch (e) {
        safeError('[IMAGECACHE] HasImage error:', e);
        return false;
      }
    }

    async loadAndCacheImage(url) {
      try {
        const isOnline = navigator.onLine;
        const cachedUrl = await this.getImageUrl(url);
        
        if (cachedUrl && !isOnline) {
          return cachedUrl;
        }

        if (isOnline) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
              const blob = await response.blob();
              await this.saveImage(url, blob);
              const objectUrl = this.createObjectUrl(blob);
              if (cachedUrl && cachedUrl !== objectUrl) {
                this.revokeObjectUrl(cachedUrl);
              }
              return objectUrl;
            }
          } catch (fetchError) {
            if (fetchError.name !== 'AbortError') {
              safeWarn('[IMAGECACHE] Fetch error:', fetchError);
            }
          }
        }

        if (cachedUrl) {
          return cachedUrl;
        }

        return url;
      } catch (error) {
        safeError('[IMAGECACHE] LoadAndCacheImage error:', error);
        try {
          const cachedUrl = await this.getImageUrl(url);
          return cachedUrl || url;
        } catch (e) {
          return url;
        }
      }
    }

    cleanup() {
      this.objectUrls.forEach((_, url) => {
        this.revokeObjectUrl(url);
      });
      this.objectUrls.clear();
    }
  }

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
      this.hayadatUpdates = [];
      this.safetyRotationInterval = null;
      this.safetyUpdateIndex = 0;
      this.imageCache = new ImageCacheManager();
      this.cachedImageUrls = new LRUCache(50);
      this.activeTimeouts = [];
      this.activeIntervals = [];
      this.activeAbortControllers = [];
      this.isLoading = false;
      this.loadContentDebounceTimer = null;
      this.imageLoadingLocks = new Map();
      this.isVisible = !document.hidden;
      this.eventListeners = [];
      this.lastLoadContentTime = 0;
      this.debounceDelay = 5000;
      this.lastYeshivaUpdatesIds = '';
    }

    getBoardId() {
      return this.boardId;
    }

    addTimeout(timeoutId) {
      this.activeTimeouts.push(timeoutId);
    }

    addInterval(intervalId) {
      this.activeIntervals.push(intervalId);
    }

    clearAllTimeouts() {
      this.activeTimeouts.forEach(id => {
        try {
          clearTimeout(id);
        } catch (e) {
          safeWarn('[LOADER] Error clearing timeout:', e);
        }
      });
      this.activeTimeouts = [];
    }

    clearAllIntervals() {
      this.activeIntervals.forEach(id => {
        try {
          clearInterval(id);
        } catch (e) {
          safeWarn('[LOADER] Error clearing interval:', e);
        }
      });
      this.activeIntervals = [];
    }

    abortAllRequests() {
      this.activeAbortControllers.forEach(controller => {
        try {
          controller.abort();
        } catch (e) {
          safeWarn('[LOADER] Error aborting request:', e);
        }
      });
      this.activeAbortControllers = [];
    }

    async checkOnline() {
      if (!navigator.onLine) return false;
      try {
        const controller = new AbortController();
        this.activeAbortControllers.push(controller);
        const timeoutId = setTimeout(() => {
          controller.abort();
          clearTimeout(timeoutId);
        }, 3000);
        this.addTimeout(timeoutId);
        const response = await fetch('/api/board-info?id=test', { 
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const index = this.activeAbortControllers.indexOf(controller);
        if (index > -1) this.activeAbortControllers.splice(index, 1);
        return response.status !== 0;
      } catch {
        return false;
      }
    }

    mergeData(existing, newData) {
      if (!existing) return newData;
      if (!newData) return existing;
      
      try {
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
      } catch (e) {
        safeError('[LOADER] MergeData error:', e);
        return existing || newData;
      }
    }

    safeSetLocalStorage(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          safeWarn('[LOADER] LocalStorage quota exceeded, cleaning old cache');
          try {
            const keys = Object.keys(localStorage);
            const oldKeys = keys.filter(k => k.startsWith('shchakim_') || k.startsWith('zmanim_') || k.startsWith('halacha_'));
            oldKeys.slice(0, Math.floor(oldKeys.length / 2)).forEach(k => {
              try {
                localStorage.removeItem(k);
              } catch (err) {
                safeWarn('[LOADER] Error removing old key:', err);
              }
            });
            localStorage.setItem(key, value);
          } catch (cleanupError) {
            safeError('[LOADER] Failed to cleanup localStorage:', cleanupError);
          }
        } else {
          safeWarn('[LOADER] LocalStorage error:', e);
        }
      }
    }

    async loadContent() {
      if (!this.isVisible) {
        safeLog('[LOAD] Page hidden, skipping load');
        return;
      }

      const now = Date.now();
      if (now - this.lastLoadContentTime < this.debounceDelay) {
        safeLog('[LOAD] Debouncing loadContent');
        if (this.loadContentDebounceTimer) {
          clearTimeout(this.loadContentDebounceTimer);
        }
        this.loadContentDebounceTimer = setTimeout(() => {
          this.loadContentDebounceTimer = null;
          this.loadContent();
        }, this.debounceDelay - (now - this.lastLoadContentTime));
        return;
      }

      if (this.isLoading) {
        safeLog('[LOAD] Already loading, skipping');
        return;
      }

      this.isLoading = true;
      this.lastLoadContentTime = now;

      try {
        const boardId = this.getBoardId();
        if (!boardId) {
          safeWarn('[LOAD] No board ID available');
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
            safeLog('[CACHE] Loaded content from local storage');
          } catch (e) {
            safeWarn('[LOAD] Failed to parse cached content', e);
          }
        }
        
        const isOnline = await this.checkOnline();
        if (isOnline) {
          try {
            const ts = Date.now();
            const controller = new AbortController();
            this.activeAbortControllers.push(controller);
            const timeoutId = setTimeout(() => {
              controller.abort();
              clearTimeout(timeoutId);
            }, 10000);
            this.addTimeout(timeoutId);
            const response = await fetch(`${this.apiBase}?boardId=${encodeURIComponent(boardId)}&t=${ts}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-store' },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            const index = this.activeAbortControllers.indexOf(controller);
            if (index > -1) this.activeAbortControllers.splice(index, 1);
            
            if (response.ok) {
              const newData = await response.json();
              const mergedData = this.mergeData(cachedData, newData);
              
              const hasChanges = mergedData._hasChanges;
              delete mergedData._hasChanges;
              
              this.content = mergedData;
              this.safeSetLocalStorage(contentKey, JSON.stringify(mergedData));
              this.safeSetLocalStorage(contentTimestampKey, Date.now().toString());
              
              if (hasChanges) {
                safeLog('[ONLINE] Data changed, updating display');
                await this.updateAll(mergedData);
              } else {
                safeLog('[ONLINE] No changes detected');
              }
            } else {
              safeWarn('[ONLINE] Server response not OK:', response.status);
              if (cachedData) {
                safeLog('[FALLBACK] Using cached data due to server error');
                this.content = cachedData;
                await this.updateAll(cachedData);
              }
            }
          } catch (error) {
            if (error.name !== 'AbortError') {
              safeWarn('[ONLINE] Error loading content from server:', error);
            }
            if (cachedData) {
              safeLog('[FALLBACK] Using cached data due to connection error');
              this.content = cachedData;
              await this.updateAll(cachedData);
            }
          }
        } else {
          safeLog('[OFFLINE] No connection, using cached data');
          if (cachedData) {
            await this.updateAll(cachedData);
          }
        }
      } catch (error) {
        safeError('[LOAD] Error loading content:', error);
        const boardId = this.getBoardId();
        if (boardId) {
          const contentKey = `shchakim_content_${boardId}`;
          const cachedContent = localStorage.getItem(contentKey);
          if (cachedContent) {
            try {
              const data = JSON.parse(cachedContent);
              this.content = data;
              await this.updateAll(data);
              safeLog('[FALLBACK] Using cached data after error');
            } catch (e) {
              safeError('[LOAD] Failed to load cached data after error:', e);
            }
          }
        }
      } finally {
        this.isLoading = false;
      }
    }

    updateBoardInfo(data) {
      try {
        if (!data?.boardInfo) return;

        const displayName = data.boardInfo.display_name || data.boardInfo.name || '';
        if (displayName) {
          const titleElement = document.querySelector('.text-wrapper-25');
          if (titleElement) {
            titleElement.textContent = `ברוכים הבאים ל${displayName}`;
          }
        }
      } catch (e) {
        safeError('[BOARDINFO] Error:', e);
      }
    }

    updateTheme(data) {
      try {
        if (!data?.theme && !data?.background) return;

        const theme = data.theme || {};
        const background = data.background || {};
        const colors = background.colors || theme.gradient || [theme.primaryHex || '#0b3d2e', '#145a43'];
        
        if (colors && colors.length >= 2) {
          const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
          if (document.documentElement) {
            document.documentElement.style.setProperty('--theme-gradient', gradient);
            document.documentElement.style.setProperty('--theme-primary', colors[0]);
            document.documentElement.style.setProperty('--theme-secondary', colors[1]);
          }
        }
      } catch (e) {
        safeError('[THEME] Error:', e);
      }
    }

    async fetchZmanim(location) {
      if (!location || !location.latitude || !location.longitude) {
        return null;
      }

      const cacheKey = `zmanim_${location.latitude}_${location.longitude}_${new Date().toISOString().slice(0, 10)}`;
      
      try {
        const controller = new AbortController();
        this.activeAbortControllers.push(controller);
        const timeoutId = setTimeout(() => {
          controller.abort();
          clearTimeout(timeoutId);
        }, 10000);
        this.addTimeout(timeoutId);
        const response = await fetch('/api/zmanim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            latitude: location.latitude,
            longitude: Math.abs(Number(location.longitude)),
            date: new Date().toISOString().slice(0, 10)
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const index = this.activeAbortControllers.indexOf(controller);
        if (index > -1) this.activeAbortControllers.splice(index, 1);

        if (response.ok) {
          const data = await response.json();
          const zmanimData = data.times || data || {};
          try {
            this.safeSetLocalStorage(cacheKey, JSON.stringify(zmanimData));
          } catch (e) {
            safeWarn('[ZMANIM] Failed to cache zmanim:', e);
          }
          return zmanimData;
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          safeWarn('[ZMANIM] Error fetching zmanim:', error);
        }
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (e) {
            safeWarn('[ZMANIM] Failed to parse cached zmanim:', e);
          }
        }
      }
      return null;
    }

    calculateRelativeTime(relativeBase, offsetMinutes, zmanimTimes) {
      try {
        if (!relativeBase || !zmanimTimes) return null;

        const baseKeyMap = {
          stars_out: 'tzeit',
          stars_out_90: 'tzeit90',
          sunset: 'sunset'
        };

        const key = baseKeyMap[relativeBase] || relativeBase;
        const raw = zmanimTimes[key] || (zmanimTimes.times && zmanimTimes.times[key]);
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
      } catch (e) {
        safeError('[RELATIVETIME] Error:', e);
        return null;
      }
    }

    async updatePrayerTimes(data) {
      try {
        safeLog('[PRAYERS] Updating prayer times with data:', data);
        
        if (!data?.prayers || !Array.isArray(data.prayers)) {
          safeWarn('[PRAYERS] No prayers data found');
          return;
        }

        safeLog('[PRAYERS] Found prayers:', data.prayers.length);

        const prayerSections = document.querySelectorAll('.div-8');
        if (prayerSections.length === 0) {
          safeWarn('[PRAYERS] Prayer sections not found');
          return;
        }

        safeLog('[PRAYERS] Found', prayerSections.length, 'prayer sections');

        let zmanimTimes = null;
        if (data?.boardInfo?.location) {
          safeLog('[PRAYERS] Fetching zmanim for location:', data.boardInfo.location);
          zmanimTimes = await this.fetchZmanim(data.boardInfo.location);
          safeLog('[PRAYERS] Zmanim times received:', zmanimTimes);
        }

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
            safeWarn('[PRAYERS] div-9 not found in prayer section');
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
              if (firstMaariv.time === '15:45') {
                suffix = ' (פלג)' + suffix;
              }
              div.className = 'text-wrapper-12';
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
      } catch (e) {
        safeError('[PRAYERS] Error in updatePrayerTimes:', e);
      }
    }

    async updateParashaTitle(data) {
      try {
        const location = data?.boardInfo?.location;
        if (location && location.latitude && location.longitude) {
          const controller = new AbortController();
          this.activeAbortControllers.push(controller);
          const timeoutId = setTimeout(() => {
            controller.abort();
            clearTimeout(timeoutId);
          }, 10000);
          this.addTimeout(timeoutId);
          const response = await fetch('/api/zmanim', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              latitude: location.latitude,
              longitude: Math.abs(Number(location.longitude)),
              date: new Date().toISOString().slice(0, 10)
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const index = this.activeAbortControllers.indexOf(controller);
          if (index > -1) this.activeAbortControllers.splice(index, 1);

          if (response.ok) {
            const zmanimData = await response.json();
            const parasha = zmanimData.parasha;
            
            if (parasha) {
              const titleElement = document.querySelector('.div-2 .div-wrapper .p');
              if (titleElement) {
                titleElement.textContent = `אגרת רבצ"ר - פרשת ${parasha}`;
                safeLog('[PARASHA] Updated parasha title to:', parasha);
              } else {
                safeWarn('[PARASHA] Title element not found');
              }
            } else {
              safeWarn('[PARASHA] No parasha found in zmanim data');
            }
          } else {
            safeWarn('[PARASHA] Failed to fetch zmanim, status:', response.status);
          }
        } else {
          safeWarn('[PARASHA] No location data available');
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          safeError('[PARASHA] Failed to update parasha title', e);
        }
      }
    }

    async updateHalacha(data) {
      const cacheKey = `halacha_${new Date().toISOString().slice(0, 10)}`;
      safeLog('[HALACHA] updateHalacha called');
      
      try {
        const controller = new AbortController();
        this.activeAbortControllers.push(controller);
        const timeoutId = setTimeout(() => {
          controller.abort();
          clearTimeout(timeoutId);
        }, 10000);
        this.addTimeout(timeoutId);
        const response = await fetch('/api/halacha/daily', { signal: controller.signal });
        clearTimeout(timeoutId);
        const index = this.activeAbortControllers.indexOf(controller);
        if (index > -1) this.activeAbortControllers.splice(index, 1);
        
        if (response.ok) {
          const halachaData = await response.json();
          const halachaItems = halachaData.items || [];
          safeLog('[HALACHA] Items count:', halachaItems.length);
          
          try {
            this.safeSetLocalStorage(cacheKey, JSON.stringify(halachaItems));
          } catch (e) {
            safeWarn('[HALACHA] Failed to cache halacha:', e);
          }
          
          if (halachaItems.length > 0) {
            const halachaContainer = document.querySelector('.div-wrapper-3');
            
            if (halachaContainer) {
              let halachaContent = halachaContainer.querySelector('p.text-wrapper-10');
              if (!halachaContent) {
                halachaContent = document.createElement('p');
                halachaContent.className = 'text-wrapper-10 sliding-text';
                halachaContainer.appendChild(halachaContent);
              } else {
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
                safeLog('[HALACHA] Updated halacha content successfully');
              } else {
                safeWarn('[HALACHA] No combined text to display');
              }
            } else {
              safeError('[HALACHA] Container .div-wrapper-3 not found!');
            }
          } else {
            safeWarn('[HALACHA] No halacha items found for today');
          }
        } else {
          const errorText = await response.text().catch(() => '');
          safeError('[HALACHA] API error:', response.status, errorText);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          safeError('[HALACHA] Error updating halacha:', error);
        }
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const halachaItems = JSON.parse(cached);
            safeLog('[HALACHA] Using cached data, items count:', halachaItems.length);
            if (halachaItems.length > 0) {
              const halachaContainer = document.querySelector('.div-wrapper-3');
              if (halachaContainer) {
                let halachaContent = halachaContainer.querySelector('p.text-wrapper-10');
                if (!halachaContent) {
                  halachaContent = document.createElement('p');
                  halachaContent.className = 'text-wrapper-10 sliding-text';
                  halachaContainer.appendChild(halachaContent);
                }
                
                const combined = halachaItems
                  .slice(0, 2)
                  .map(item => item.summary || item.text || item.content || '')
                  .filter(Boolean)
                  .join('<br/><br/>');
                if (combined) {
                  halachaContent.innerHTML = combined;
                  safeLog('[HALACHA] Updated from cache');
                }
              }
            }
          } catch (e) {
            safeWarn('[HALACHA] Failed to parse cached halacha:', e);
          }
        }
      }
    }

    updateUpdates(data) {
      try {
        if (!data?.updates || !Array.isArray(data.updates)) return;

        const hayadatUpdates = [];
        const yeshivaUpdates = [];
        const displayUpdates = [];
        const safetyUpdates = [];

        data.updates.forEach(update => {
          try {
            const title = (update.title || update.name || '').toLowerCase();
            const type = (update.type || '').toLowerCase();
            const typeOriginal = (update.type || '').trim();
            
            if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
              safetyUpdates.push(update);
            }
            else if (typeOriginal === 'הידעת?' || type.includes('הידעת') || type.includes('הידעת?') || title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
              hayadatUpdates.push(update);
            } 
            else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
              yeshivaUpdates.push(update);
            }
            else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') || 
                     type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
              displayUpdates.push(update);
            }
          } catch (e) {
            safeWarn('[UPDATES] Error processing update:', e);
          }
        });

        const safetyContent = document.querySelector('.text-wrapper-15.safety-content');
        if (safetyContent) {
          if (safetyUpdates.length > 0) {
            this.displaySafetyUpdatesWithScrolling(safetyUpdates, safetyContent);
          }
        }

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

        const hayadatSection = document.querySelector('section.did-you-know-section');
        if (hayadatSection) {
          const hayadatContent = hayadatSection.querySelector('div.text-wrapper-27') || hayadatSection.querySelector('div[role="text"]') || hayadatSection.querySelector('div');
          if (hayadatContent) {
            const allDisplayUpdates = [...displayUpdates, ...yeshivaUpdates];
            if (allDisplayUpdates.length > 0) {
              this.displayUpdatesInDidYouKnow(allDisplayUpdates, hayadatContent);
            }
          }
          
          const hayadatImage = hayadatSection.querySelector('img');
          safeLog('[UPDATES] Hayadat section found:', !!hayadatSection, 'Image found:', !!hayadatImage, 'Updates count:', hayadatUpdates.length);
          if (hayadatImage && hayadatUpdates.length > 0) {
            safeLog('[UPDATES] Hayadat updates:', hayadatUpdates.map(u => ({ id: u.id, title: u.title, imageUrl: u.imageUrl })));
            const updatesChanged = JSON.stringify(this.hayadatUpdates) !== JSON.stringify(hayadatUpdates);
            if (updatesChanged || !this.hayadatImageRotationInterval) {
              safeLog('[UPDATES] Starting hayadat image rotation, changed:', updatesChanged);
              this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImage);
            } else {
              this.hayadatUpdates = hayadatUpdates;
            }
          } else if (hayadatImage && hayadatUpdates.length === 0 && this.hayadatImageRotationInterval) {
            clearTimeout(this.hayadatImageRotationInterval);
            this.hayadatImageRotationInterval = null;
          } else {
            safeLog('[UPDATES] Cannot display hayadat images - image:', !!hayadatImage, 'updates:', hayadatUpdates.length);
          }
        }

        // בעמוד welcome1 - התמונה של "פינת הידעת?" נמצאת בתוך div-11 > div:first-child > img.img
        const hayadatImageWelcome1 = document.querySelector('.div-11 .img');
        safeLog('[UPDATES] Hayadat image element found:', !!hayadatImageWelcome1);
        if (hayadatImageWelcome1) {
          if (hayadatUpdates.length > 0) {
            const updatesChanged = JSON.stringify(this.hayadatUpdates) !== JSON.stringify(hayadatUpdates);
            if (updatesChanged || !this.hayadatImageRotationInterval) {
              safeLog('[UPDATES] Updating hayadat image with', hayadatUpdates.length, 'updates');
              this.displayHayadatImagesWithRotation(hayadatUpdates, hayadatImageWelcome1);
            } else {
              this.hayadatUpdates = hayadatUpdates;
            }
          } else {
            safeLog('[UPDATES] No hayadat updates to display');
            if (this.hayadatImageRotationInterval) {
              clearTimeout(this.hayadatImageRotationInterval);
              this.hayadatImageRotationInterval = null;
            }
          }
        }
      } catch (e) {
        safeError('[UPDATES] Error in updateUpdates:', e);
      }
    }

    updateMainAnnouncement(data) {
      try {
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

        safeLog('[ANNOUNCEMENT] Found', candidates.length, 'updates to display');

        const target = document.querySelector('.element-3');
        if (!target) {
          safeWarn('[ANNOUNCEMENT] element-3 not found');
          return;
        }
        
        if (candidates.length === 0) {
          safeWarn('[ANNOUNCEMENT] No updates to display');
          return;
        }

        const allContent = candidates
          .map(update => {
            const content = update.content || update.text || update.title || update.name;
            return content;
          })
          .filter(Boolean)
          .join('<br/><br/>---<br/><br/>');
        
        if (allContent) {
          safeLog('[ANNOUNCEMENT] Setting content');
          target.innerHTML = allContent.replace(/\n/g, '<br/>');
        } else {
          safeWarn('[ANNOUNCEMENT] No content to display');
        }
      } catch (e) {
        safeError('[ANNOUNCEMENT] Error in updateMainAnnouncement:', e);
      }
    }

    displayUpdatesInDidYouKnow(updates, contentElement) {
      try {
        if (!updates || updates.length === 0 || !contentElement) return;

        if (this.updatesRotationInterval) {
          clearTimeout(this.updatesRotationInterval);
          this.updatesRotationInterval = null;
        }

        this.currentUpdateIndex = 0;
        this.showCurrentUpdateInDidYouKnow(updates, contentElement);
        this.rotateToNextUpdateInDidYouKnow(updates, contentElement);
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in displayUpdatesInDidYouKnow:', e);
      }
    }

    rotateToNextUpdateInDidYouKnow(updates, contentElement) {
      try {
        if (!updates || updates.length === 0) return;

        const currentUpdate = updates[this.currentUpdateIndex];
        if (!currentUpdate) return;

        const displayTime = (currentUpdate.displayTime || 20) * 1000;

        const timeoutId = setTimeout(() => {
          this.currentUpdateIndex = (this.currentUpdateIndex + 1) % updates.length;
          this.showCurrentUpdateInDidYouKnow(updates, contentElement);
          this.rotateToNextUpdateInDidYouKnow(updates, contentElement);
        }, displayTime);
        this.addTimeout(timeoutId);
        this.updatesRotationInterval = timeoutId;
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in rotateToNextUpdateInDidYouKnow:', e);
      }
    }

    showCurrentUpdateInDidYouKnow(updates, contentElement) {
      try {
        if (updates.length === 0 || !contentElement) return;

        const currentUpdate = updates[this.currentUpdateIndex];
        if (!currentUpdate) return;

        const content = currentUpdate.content || currentUpdate.text || '';
        if (content) {
          contentElement.innerHTML = content.replace(/\n/g, '<br/>');
        }
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in showCurrentUpdateInDidYouKnow:', e);
      }
    }

    displayYeshivaImagesWithRotation(updates, imageElement) {
      try {
        if (!updates || updates.length === 0 || !imageElement) return;

        if (this.yeshivaImageRotationInterval) {
          clearTimeout(this.yeshivaImageRotationInterval);
          this.yeshivaImageRotationInterval = null;
        }

        const currentUpdatesIds = updates.map(u => `${u.id || u.title}:${u.imageUrl || u.image || u.img || ''}`).join('|');
        const lastUpdatesIds = this.lastYeshivaUpdatesIds || '';
        
        safeLog('[YESHIVA-IMAGE] Current IDs:', currentUpdatesIds);
        safeLog('[YESHIVA-IMAGE] Last IDs:', lastUpdatesIds);
        
        if (currentUpdatesIds !== lastUpdatesIds) {
          safeLog('[YESHIVA-IMAGE] Updates changed, resetting rotation');
          this.lastYeshivaUpdatesIds = currentUpdatesIds;
          this.yeshivaImageIndex = 0;
          this.showCurrentYeshivaImage(updates, imageElement, true).then(() => {
            this.rotateToNextYeshivaImage(updates, imageElement);
          }).catch(e => safeError('[YESHIVA] Error in displayYeshivaImagesWithRotation:', e));
        } else {
          safeLog('[YESHIVA-IMAGE] Updates unchanged, forcing image update');
          this.showCurrentYeshivaImage(updates, imageElement, true);
        }
      } catch (e) {
        safeError('[YESHIVA] Error in displayYeshivaImagesWithRotation:', e);
      }
    }

    rotateToNextYeshivaImage(updates, imageElement) {
      try {
        if (!updates || updates.length === 0) return;

        const currentUpdate = updates[this.yeshivaImageIndex];
        if (!currentUpdate) return;

        const displayTime = (currentUpdate.displayTime || 20) * 1000;

        const timeoutId = setTimeout(async () => {
          this.yeshivaImageIndex = (this.yeshivaImageIndex + 1) % updates.length;
          await this.showCurrentYeshivaImage(updates, imageElement);
          this.rotateToNextYeshivaImage(updates, imageElement);
        }, displayTime);
        this.addTimeout(timeoutId);
        this.yeshivaImageRotationInterval = timeoutId;
      } catch (e) {
        safeError('[YESHIVA] Error in rotateToNextYeshivaImage:', e);
      }
    }

    async showCurrentYeshivaImage(updates, imageElement, forceUpdate = false) {
      try {
        if (updates.length === 0 || !imageElement) return;

        const currentUpdate = updates[this.yeshivaImageIndex];
        if (!currentUpdate) return;

        const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
        if (!imageUrl) return;

        const lockKey = `yeshiva_${imageUrl}`;
        if (this.imageLoadingLocks.has(lockKey) && !forceUpdate) {
          return;
        }
        this.imageLoadingLocks.set(lockKey, true);

        let finalUrl = '';
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
          let basePath = '/welcome1';
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
        
        const urlBase = finalUrl.split('?')[0].split('&')[0];
        const currentSrc = imageElement.src ? imageElement.src.split('?')[0].split('&')[0] : '';
        const cachedUrl = this.cachedImageUrls.get(urlBase);
        
        if (cachedUrl && !forceUpdate && currentSrc === cachedUrl) {
          this.imageLoadingLocks.delete(lockKey);
          return;
        }

        const isOnline = await this.checkOnline();
        if (isOnline) {
          try {
            const cachedImageUrl = await this.imageCache.loadAndCacheImage(finalUrl);
            if (cachedImageUrl && cachedImageUrl !== finalUrl) {
              this.cachedImageUrls.set(urlBase, cachedImageUrl);
              if (imageElement && imageElement.parentNode) {
                imageElement.src = cachedImageUrl;
                imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה';
              }
              safeLog('[YESHIVA-IMAGE] Using cached image:', cachedImageUrl);
              this.imageLoadingLocks.delete(lockKey);
              return;
            }
          } catch (error) {
            safeWarn('[YESHIVA-IMAGE] Error loading cached image:', error);
          }
        }

        const cachedImageUrl = await this.imageCache.getImageUrl(urlBase);
        if (cachedImageUrl) {
          this.cachedImageUrls.set(urlBase, cachedImageUrl);
          if (imageElement && imageElement.parentNode) {
            imageElement.src = cachedImageUrl;
            imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה';
          }
          safeLog('[YESHIVA-IMAGE] Using offline cached image:', cachedImageUrl);
          
          if (isOnline) {
            this.imageCache.loadAndCacheImage(finalUrl).then(cachedUrl => {
              if (cachedUrl && cachedUrl !== finalUrl) {
                this.cachedImageUrls.set(urlBase, cachedUrl);
                if (imageElement && imageElement.parentNode && imageElement.src === cachedImageUrl) {
                  imageElement.src = cachedUrl;
                }
              }
            }).catch(err => safeWarn('[YESHIVA-IMAGE] Background cache update failed:', err));
          }
          this.imageLoadingLocks.delete(lockKey);
          return;
        }

        if (forceUpdate || currentSrc !== urlBase) {
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
          if (imageElement && imageElement.parentNode) {
            imageElement.src = finalSrc;
            imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה';
          }
          
          if (isOnline) {
            this.imageCache.loadAndCacheImage(finalUrl).then(cachedUrl => {
              if (cachedUrl && cachedUrl !== finalUrl) {
                this.cachedImageUrls.set(urlBase, cachedUrl);
              }
            }).catch(err => safeWarn('[YESHIVA-IMAGE] Background cache failed:', err));
          }
        }
        this.imageLoadingLocks.delete(lockKey);
      } catch (e) {
        safeError('[YESHIVA-IMAGE] Error in showCurrentYeshivaImage:', e);
        const lockKey = `yeshiva_${currentUpdate?.imageUrl || ''}`;
        this.imageLoadingLocks.delete(lockKey);
      }
    }

    displayHayadatImagesWithRotation(updates, imageElement) {
      try {
        if (!updates || updates.length === 0 || !imageElement) {
          safeLog('[HAYADAT-IMAGE] Cannot display: updates=', updates?.length, 'imageElement=', !!imageElement);
          return;
        }

        safeLog('[HAYADAT-IMAGE] Starting rotation with', updates.length, 'updates');

        if (this.hayadatImageRotationInterval) {
          clearTimeout(this.hayadatImageRotationInterval);
          this.hayadatImageRotationInterval = null;
        }

        this.hayadatImageIndex = 0;
        this.hayadatUpdates = updates;
        this.showCurrentHayadatImage(updates, imageElement).then(() => {
          this.rotateToNextHayadatImage(updates, imageElement);
        }).catch(e => safeError('[HAYADAT] Error in displayHayadatImagesWithRotation:', e));
      } catch (e) {
        safeError('[HAYADAT] Error in displayHayadatImagesWithRotation:', e);
      }
    }

    rotateToNextHayadatImage(updates, imageElement) {
      try {
        if (!updates || updates.length === 0 || !imageElement) return;

        this.hayadatUpdates = updates;
        const currentUpdate = updates[this.hayadatImageIndex];
        if (!currentUpdate) {
          this.hayadatImageIndex = 0;
          return;
        }

        const displayTime = (currentUpdate.displayTime || 20) * 1000;

        const timeoutId = setTimeout(async () => {
          if (!this.hayadatUpdates || this.hayadatUpdates.length === 0 || !imageElement) return;
          
          this.hayadatImageIndex = (this.hayadatImageIndex + 1) % this.hayadatUpdates.length;
          await this.showCurrentHayadatImage(this.hayadatUpdates, imageElement);
          this.rotateToNextHayadatImage(this.hayadatUpdates, imageElement);
        }, displayTime);
        this.addTimeout(timeoutId);
        this.hayadatImageRotationInterval = timeoutId;
      } catch (e) {
        safeError('[HAYADAT] Error in rotateToNextHayadatImage:', e);
      }
    }

    async showCurrentHayadatImage(updates, imageElement) {
      try {
        if (updates.length === 0 || !imageElement) {
          safeLog('[HAYADAT-IMAGE] No updates to display');
          return;
        }

        const currentUpdate = updates[this.hayadatImageIndex];
        if (!currentUpdate) {
          safeLog('[HAYADAT-IMAGE] No current update at index', this.hayadatImageIndex);
          return;
        }

        const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
        safeLog('[HAYADAT-IMAGE] Showing image', this.hayadatImageIndex + 1, 'of', updates.length, 'imageUrl:', imageUrl);
        if (!imageUrl) return;

        const lockKey = `hayadat_${imageUrl}`;
        if (this.imageLoadingLocks.has(lockKey)) {
          return;
        }
        this.imageLoadingLocks.set(lockKey, true);

        let finalUrl = '';
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
          let basePath = '/welcome1';
          const existingImg = document.querySelector('section.did-you-know-section img, .div-11 .img');
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
        
        const urlBase = finalUrl.split('?')[0].split('&')[0];
        const currentSrc = imageElement.src ? imageElement.src.split('?')[0].split('&')[0] : '';
        const cachedUrl = this.cachedImageUrls.get(urlBase);
        
        if (cachedUrl && currentSrc === cachedUrl) {
          this.imageLoadingLocks.delete(lockKey);
          return;
        }

        const isOnline = await this.checkOnline();
        if (isOnline) {
          try {
            const cachedImageUrl = await this.imageCache.loadAndCacheImage(finalUrl);
            if (cachedImageUrl && cachedImageUrl !== finalUrl) {
              this.cachedImageUrls.set(urlBase, cachedImageUrl);
              if (imageElement && imageElement.parentNode) {
                imageElement.src = cachedImageUrl;
                imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
              }
              safeLog('[HAYADAT-IMAGE] Using cached image:', cachedImageUrl);
              this.imageLoadingLocks.delete(lockKey);
              return;
            }
          } catch (error) {
            safeWarn('[HAYADAT-IMAGE] Error loading cached image:', error);
          }
        }

        const cachedImageUrl = await this.imageCache.getImageUrl(urlBase);
        if (cachedImageUrl) {
          this.cachedImageUrls.set(urlBase, cachedImageUrl);
          if (imageElement && imageElement.parentNode) {
            imageElement.src = cachedImageUrl;
            imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
          }
          safeLog('[HAYADAT-IMAGE] Using offline cached image:', cachedImageUrl);
          
          if (isOnline) {
            this.imageCache.loadAndCacheImage(finalUrl).then(cachedUrl => {
              if (cachedUrl && cachedUrl !== finalUrl) {
                this.cachedImageUrls.set(urlBase, cachedUrl);
                if (imageElement && imageElement.parentNode && imageElement.src === cachedImageUrl) {
                  imageElement.src = cachedUrl;
                }
              }
            }).catch(err => safeWarn('[HAYADAT-IMAGE] Background cache update failed:', err));
          }
          this.imageLoadingLocks.delete(lockKey);
          return;
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
        if (imageElement && imageElement.parentNode) {
          imageElement.src = finalSrc;
          imageElement.alt = currentUpdate.title || currentUpdate.name || 'תמונה הידעת';
        }
        
        if (isOnline) {
          this.imageCache.loadAndCacheImage(finalUrl).then(cachedUrl => {
            if (cachedUrl && cachedUrl !== finalUrl) {
              this.cachedImageUrls.set(urlBase, cachedUrl);
            }
          }).catch(err => safeWarn('[HAYADAT-IMAGE] Background cache failed:', err));
        }
        this.imageLoadingLocks.delete(lockKey);
      } catch (e) {
        safeError('[HAYADAT-IMAGE] Error in showCurrentHayadatImage:', e);
        const lockKey = `hayadat_${currentUpdate?.imageUrl || ''}`;
        this.imageLoadingLocks.delete(lockKey);
      }
    }

    displaySafetyUpdatesWithScrolling(updates, contentElement) {
      try {
        if (!updates || updates.length === 0 || !contentElement) return;

        if (this.safetyRotationInterval) {
          clearTimeout(this.safetyRotationInterval);
          this.safetyRotationInterval = null;
        }

        this.safetyUpdateIndex = 0;
        this.showCurrentSafetyUpdate(updates, contentElement);
        this.rotateToNextSafetyUpdate(updates, contentElement);
      } catch (e) {
        safeError('[SAFETY] Error in displaySafetyUpdatesWithScrolling:', e);
      }
    }

    rotateToNextSafetyUpdate(updates, contentElement) {
      try {
        if (!updates || updates.length === 0) return;

        const currentUpdate = updates[this.safetyUpdateIndex];
        if (!currentUpdate) return;

        const displayTime = (currentUpdate.displayTime || 20) * 1000;

        const timeoutId = setTimeout(() => {
          this.safetyUpdateIndex = (this.safetyUpdateIndex + 1) % updates.length;
          this.showCurrentSafetyUpdate(updates, contentElement);
          this.rotateToNextSafetyUpdate(updates, contentElement);
        }, displayTime);
        this.addTimeout(timeoutId);
        this.safetyRotationInterval = timeoutId;
      } catch (e) {
        safeError('[SAFETY] Error in rotateToNextSafetyUpdate:', e);
      }
    }

    showCurrentSafetyUpdate(updates, contentElement) {
      try {
        if (updates.length === 0 || !contentElement) return;

        const currentUpdate = updates[this.safetyUpdateIndex];
        if (!currentUpdate) return;

        const content = currentUpdate.content || currentUpdate.text || currentUpdate.title || currentUpdate.name;
        if (content) {
          contentElement.innerHTML = content.replace(/\n/g, '<br/>');
        }
      } catch (e) {
        safeError('[SAFETY] Error in showCurrentSafetyUpdate:', e);
      }
    }

    calculateTotalDisplayTime(updates) {
      try {
        if (!updates || updates.length === 0) return 60000;
        return updates.reduce((total, update) => {
          return total + ((update.displayTime || 20) * 1000);
        }, 0);
      } catch (e) {
        safeError('[DISPLAYTIME] Error:', e);
        return 60000;
      }
    }

    updateShuttleTimes(data) {
    }

    updateLetter(data) {
      try {
        if (!data?.letter) {
          safeLog('[LETTER] No letter in data');
          return;
        }

        safeLog('[LETTER] Updating letter content, length:', data.letter.length);
        
        const text = data.letter.trim();
        const allText = text.replace(/\n\s*\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const allWords = allText.split(/\s+/).filter(w => w.length > 0);
        
        const totalWords = allWords.length;
        const maxWordsInColumn3 = 100;
        
        const wordsForColumns1And2 = totalWords - maxWordsInColumn3;
        const wordsPerColumn1 = Math.floor(wordsForColumns1And2 / 2);
        const wordsPerColumn2 = wordsForColumns1And2 - wordsPerColumn1;
        const wordsPerColumn3 = Math.min(maxWordsInColumn3, totalWords - wordsPerColumn1 - wordsPerColumn2);
        
        const words1 = allWords.slice(0, wordsPerColumn1);
        const words2 = allWords.slice(wordsPerColumn1, wordsPerColumn1 + wordsPerColumn2);
        const words3 = allWords.slice(wordsPerColumn1 + wordsPerColumn2);
        
        const part1 = words1.join(' ');
        const part2 = words2.join(' ');
        const part3 = words3.join(' ');
        
        safeLog('[LETTER] Equal distribution:', wordsPerColumn1, wordsPerColumn2, words3.length, 'words per column, total:', totalWords);
        
        const element2 = document.querySelector('.text-wrapper-2');
        if (element2) {
          element2.setAttribute('dir', 'rtl');
          element2.innerHTML = part1;
          safeLog('[LETTER] Updated .text-wrapper-2');
        }
        
        const element3 = document.querySelector('.text-wrapper-3');
        if (element3) {
          element3.setAttribute('dir', 'rtl');
          element3.innerHTML = part2;
          safeLog('[LETTER] Updated .text-wrapper-3');
        }
        
        const element4 = document.querySelector('.text-wrapper-4');
        if (element4) {
          element4.setAttribute('dir', 'rtl');
          element4.innerHTML = part3;
          safeLog('[LETTER] Updated .text-wrapper-4');
        } else {
          safeWarn('[LETTER] Letter elements not found');
        }
        
        const div3 = document.querySelector('.div-3');
        if (div3) {
          div3.setAttribute('dir', 'rtl');
        }
      } catch (e) {
        safeError('[LETTER] Error in updateLetter:', e);
      }
    }

    async updateAll(data) {
      if (!data) {
        safeWarn('[UPDATE] No data provided to updateAll');
        return;
      }
      
      safeLog('[UPDATE] Starting updateAll');
      
      try {
        this.updateBoardInfo(data);
        this.updateTheme(data);
        await this.updatePrayerTimes(data);
        await this.updateParashaTitle(data);
        await this.updateHalacha(data);
        this.updateLetter(data);
        this.updateUpdates(data);
        this.updateShuttleTimes(data);
        this.updateMainAnnouncement(data);
        
        this.notifyParentOfDisplayTime(data);
        
        const boardId = this.getBoardId();
        if (boardId) {
          const contentKey = `shchakim_content_${boardId}`;
          try {
            this.safeSetLocalStorage(contentKey, JSON.stringify(data));
            this.safeSetLocalStorage(`shchakim_content_timestamp_${boardId}`, Date.now().toString());
          } catch (e) {
            safeWarn('[UPDATE] Failed to save data to localStorage:', e);
          }
        }
      } catch (error) {
        safeError('[UPDATE] Error in updateAll:', error);
        const boardId = this.getBoardId();
        if (boardId) {
          const contentKey = `shchakim_content_${boardId}`;
          try {
            this.safeSetLocalStorage(contentKey, JSON.stringify(data));
          } catch (e) {
            safeWarn('[UPDATE] Failed to save data to localStorage after error:', e);
          }
        }
      }
    }

    notifyParentOfDisplayTime(data) {
      try {
        if (!data?.updates || !Array.isArray(data.updates)) return;

        const hayadatUpdates = [];
        const yeshivaUpdates = [];
        const displayUpdates = [];
        const safetyUpdates = [];

        data.updates.forEach(update => {
          try {
            const title = (update.title || update.name || '').toLowerCase();
            const type = (update.type || '').toLowerCase();
            const typeOriginal = (update.type || '').trim();
            
            if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
              safetyUpdates.push(update);
            }
            else if (typeOriginal === 'הידעת?' || type.includes('הידעת') || type.includes('הידעת?') || title.includes('הידעת') || title.includes('hayadat') || title.includes('ידעת')) {
              hayadatUpdates.push(update);
            } else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
              yeshivaUpdates.push(update);
            } else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') || 
                       type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
              displayUpdates.push(update);
            }
          } catch (e) {
            safeWarn('[NOTIFY] Error processing update:', e);
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
          try {
            window.parent.postMessage({
              type: 'BOARD_DISPLAY_TIME',
              totalTime: totalTime
            }, '*');
          } catch (e) {
            safeWarn('[NOTIFY] Error posting message:', e);
          }
        }
      } catch (e) {
        safeError('[NOTIFY] Error in notifyParentOfDisplayTime:', e);
      }
    }

    setupPeriodicUpdates() {
      try {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
        }
        const intervalId = setInterval(async () => {
          if (this.isVisible) {
            await this.loadContent();
          }
        }, 30000);
        this.addInterval(intervalId);
        this.updateInterval = intervalId;
      } catch (e) {
        safeError('[PERIODIC] Error setting up periodic updates:', e);
      }
    }

    setupOnlineOfflineListeners() {
      try {
        const onlineHandler = async () => {
          safeLog('[NETWORK] Connection restored, checking for updates');
          const boardId = this.getBoardId();
          if (boardId) {
            await this.loadContent();
          }
        };

        const offlineHandler = () => {
          safeLog('[NETWORK] Connection lost, using cached data');
          const boardId = this.getBoardId();
          if (boardId) {
            const contentKey = `shchakim_content_${boardId}`;
            const cachedContent = localStorage.getItem(contentKey);
            if (cachedContent) {
              try {
                const data = JSON.parse(cachedContent);
                this.content = data;
                this.updateAll(data);
                safeLog('[OFFLINE] Loaded content from cache');
              } catch (e) {
                safeWarn('[OFFLINE] Failed to load cached content:', e);
              }
            }
          }
        };

        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
        this.eventListeners.push({ type: 'online', handler: onlineHandler });
        this.eventListeners.push({ type: 'offline', handler: offlineHandler });
      } catch (e) {
        safeError('[NETWORK] Error setting up listeners:', e);
      }
    }

    setupVisibilityListener() {
      try {
        const visibilityHandler = () => {
          this.isVisible = !document.hidden;
          if (this.isVisible) {
            safeLog('[VISIBILITY] Page visible, resuming updates');
            this.loadContent();
          } else {
            safeLog('[VISIBILITY] Page hidden, pausing updates');
          }
        };

        document.addEventListener('visibilitychange', visibilityHandler);
        this.eventListeners.push({ type: 'visibilitychange', handler: visibilityHandler, target: document });
      } catch (e) {
        safeError('[VISIBILITY] Error setting up visibility listener:', e);
      }
    }

    start() {
      try {
        safeLog('[LOADER] BoardDataLoader.start() called');
        this.setupVisibilityListener();
        this.loadContent();
        this.setupPeriodicUpdates();
        this.setupOnlineOfflineListeners();
      } catch (e) {
        safeError('[LOADER] Error in start:', e);
      }
    }

    stop() {
      try {
        safeLog('[LOADER] Stopping BoardDataLoader');
        
        if (this.loadContentDebounceTimer) {
          clearTimeout(this.loadContentDebounceTimer);
          this.loadContentDebounceTimer = null;
        }

        this.clearAllTimeouts();
        this.clearAllIntervals();
        this.abortAllRequests();

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

        this.eventListeners.forEach(({ type, handler, target = window }) => {
          try {
            (target || window).removeEventListener(type, handler);
          } catch (e) {
            safeWarn('[LOADER] Error removing event listener:', e);
          }
        });
        this.eventListeners = [];

        this.imageCache.cleanup();
        this.cachedImageUrls.clear();
        this.imageLoadingLocks.clear();
        this.isLoading = false;
      } catch (e) {
        safeError('[LOADER] Error in stop:', e);
      }
    }
  }

  function initializeBoardDataLoader() {
    try {
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
    } catch (e) {
      safeError('[INIT] Error initializing BoardDataLoader:', e);
    }
  }

  initializeBoardDataLoader();
})();
