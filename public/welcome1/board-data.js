(function() {
  'use strict';

  const DEBUG_LOGS = false;

  function safeLog(...args) {
    try {
      if (!DEBUG_LOGS) return;
      if (console && typeof console.log === 'function') {
        console.log(...args);
      }
    } catch (e) {
    }
  }

  function safeWarn(...args) {
    try {
      if (!DEBUG_LOGS) return;
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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

    cleanupUnusedObjectUrls() {
      const maxUrls = 50;
      if (this.objectUrls.size > maxUrls) {
        const urlsToRemove = Array.from(this.objectUrls.keys()).slice(0, this.objectUrls.size - maxUrls);
        urlsToRemove.forEach(url => {
          this.revokeObjectUrl(url);
        });
      }
    }

    async cleanupIndexedDB() {
      try {
        await this.init();
        if (!this.db) return;
        
        const maxSize = 100 * 1024 * 1024;
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAllKeys();
        
        return new Promise((resolve) => {
          request.onsuccess = async () => {
            try {
              const keys = request.result;
              if (keys.length === 0) {
                resolve();
                return;
              }
              
              let totalSize = 0;
              const entries = [];
              
              for (const key of keys) {
                try {
                  const getTransaction = this.db.transaction([this.storeName], 'readonly');
                  const getStore = getTransaction.objectStore(this.storeName);
                  const getRequest = getStore.get(key);
                  
                  await new Promise((getResolve) => {
                    getRequest.onsuccess = () => {
                      const blob = getRequest.result;
                      const size = blob ? blob.size : 0;
                      totalSize += size;
                      entries.push({ key, size });
                      getResolve();
                    };
                    getRequest.onerror = () => getResolve();
                  });
                } catch (e) {
                  safeWarn('[IMAGECACHE] Error getting blob size for key:', key);
                }
              }
              
              if (totalSize > maxSize) {
                entries.sort((a, b) => a.size - b.size);
                const toRemove = Math.floor(entries.length * 0.3);
                const deleteTransaction = this.db.transaction([this.storeName], 'readwrite');
                const deleteStore = deleteTransaction.objectStore(this.storeName);
                
                for (let i = 0; i < toRemove; i++) {
                  deleteStore.delete(entries[i].key);
                }
                safeLog('[IMAGECACHE] Cleaned up', toRemove, 'old images from IndexedDB');
              }
              resolve();
            } catch (e) {
              safeWarn('[IMAGECACHE] Error during cleanup:', e);
              resolve();
            }
          };
          request.onerror = () => {
            safeWarn('[IMAGECACHE] Error getting keys for cleanup');
            resolve();
          };
        });
      } catch (e) {
        safeWarn('[IMAGECACHE] Error in cleanupIndexedDB:', e);
      }
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
      this.maxArraySize = 100;
      this.cleanupInterval = null;
      this.objectUrlCleanupInterval = null;
      // Rotation targets. Kept on the instance so a wall-clock tick can re-render
      // without being handed the elements again.
      this.hayadatImageElement = null;
      this.yeshivaImageElement = null;
      this.didYouKnowElement = null;
      this.safetyElement = null;
      this.yeshivaUpdates = [];
      this.didYouKnowUpdates = [];
      this.safetyUpdates = [];
      this.expirySweepTimer = null;
    }

    getBoardId() {
      return this.boardId;
    }

    addTimeout(timeoutId) {
      if (this.activeTimeouts.length >= this.maxArraySize) {
        const oldest = this.activeTimeouts.shift();
        try {
          clearTimeout(oldest);
        } catch (e) {
          safeWarn('[LOADER] Error clearing oldest timeout:', e);
        }
      }
      this.activeTimeouts.push(timeoutId);
    }

    addInterval(intervalId) {
      if (this.activeIntervals.length >= this.maxArraySize) {
        const oldest = this.activeIntervals.shift();
        try {
          clearInterval(oldest);
        } catch (e) {
          safeWarn('[LOADER] Error clearing oldest interval:', e);
        }
      }
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

    cleanupOldAbortControllers() {
      if (this.activeAbortControllers.length >= this.maxArraySize) {
        const toRemove = this.activeAbortControllers.length - this.maxArraySize;
        for (let i = 0; i < toRemove; i++) {
          try {
            this.activeAbortControllers[i].abort();
          } catch (e) {
            safeWarn('[LOADER] Error aborting old controller:', e);
          }
        }
        this.activeAbortControllers = this.activeAbortControllers.slice(toRemove);
      }
    }

    async checkOnline() {
      if (!navigator.onLine) return false;
      try {
        this.cleanupOldAbortControllers();
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
      // Nothing cached yet → everything is new. Without the flag the very first
      // load fell through to "no changes" and the board sat on the static design
      // until the next page load.
      if (!existing) return { ...newData, _hasChanges: true };
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
        
        // The server is the single source of truth for updates. The previous
        // version merged the server list INTO the cached one by id, so an update
        // deleted or replaced from the phone survived forever in localStorage and
        // kept its slot at the head of the rotation — that is why new images
        // stopped showing up after a while. Replace, never accumulate.
        if (Array.isArray(newData.updates)) {
          if (JSON.stringify(existing.updates || []) !== JSON.stringify(newData.updates)) {
            merged.updates = newData.updates;
            hasChanges = true;
          }
        }
        
        // Anything the board renders must be listed here — mergeData starts from the
        // CACHED object, so a field that isn't copied over is silently dropped.
        if ('supportLines' in newData) {
          if (JSON.stringify(existing.supportLines ?? null) !== JSON.stringify(newData.supportLines ?? null)) {
            merged.supportLines = newData.supportLines ?? null;
            hasChanges = true;
          }
        }

        if ('photoBoard' in newData) {
          if (JSON.stringify(existing.photoBoard ?? null) !== JSON.stringify(newData.photoBoard ?? null)) {
            merged.photoBoard = newData.photoBoard ?? null;
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

    getTodayAndShabbatDates() {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      
      const dayOfWeek = today.getDay();
      const daysUntilShabbat = dayOfWeek === 5 ? 0 : (5 - dayOfWeek + 7) % 7;
      const shabbatDate = new Date(today);
      shabbatDate.setDate(today.getDate() + daysUntilShabbat);
      const shabbatStr = shabbatDate.toISOString().slice(0, 10);
      
      return { today: todayStr, shabbat: shabbatStr };
    }

    cleanupLocalStorage() {
      try {
        const { today, shabbat } = this.getTodayAndShabbatDates();
        const keys = Object.keys(localStorage);
        let cleaned = 0;
        
        keys.forEach(key => {
          try {
            if (key.startsWith('shchakim_content_') || key.startsWith('shchakim_content_timestamp_')) {
              return;
            }
            
            if (key.startsWith('zmanim_')) {
              const dateMatch = key.match(/zmanim_[^_]+_[^_]+_(\d{4}-\d{2}-\d{2})/);
              if (dateMatch) {
                const dateStr = dateMatch[1];
                if (dateStr !== today && dateStr !== shabbat) {
                  localStorage.removeItem(key);
                  cleaned++;
                }
              }
            } else if (key.startsWith('halacha_')) {
              const dateMatch = key.match(/halacha_(\d{4}-\d{2}-\d{2})/);
              if (dateMatch) {
                const dateStr = dateMatch[1];
                if (dateStr !== today && dateStr !== shabbat) {
                  localStorage.removeItem(key);
                  cleaned++;
                }
              }
            }
          } catch (e) {
            safeWarn('[LOADER] Error cleaning localStorage key:', key, e);
          }
        });
        
        if (cleaned > 0) {
          safeLog('[LOADER] Cleaned', cleaned, 'old localStorage entries');
        }
      } catch (e) {
        safeError('[LOADER] Error in cleanupLocalStorage:', e);
      }
    }

    safeSetLocalStorage(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          safeWarn('[LOADER] LocalStorage quota exceeded, cleaning old cache');
          this.cleanupLocalStorage();
          try {
            localStorage.setItem(key, value);
          } catch (cleanupError) {
            safeError('[LOADER] Failed to save after cleanup:', cleanupError);
          }
        } else {
          safeWarn('[LOADER] LocalStorage error:', e);
        }
      }
    }

    async loadContent() {
      if (!this.isVisible && this.content) {
        safeLog('[LOAD] Page hidden, skipping refresh');
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
            this.cleanupOldAbortControllers();
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
            this.content = cachedData;
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
        this.cleanupOldAbortControllers();
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
          this.cleanupOldAbortControllers();
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
        this.cleanupOldAbortControllers();
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

        // Expired updates are dropped here (and by the server) — see visibleUpdates().
        const sections = this.categorizeUpdates(data);
        safeLog('[UPDATES] Active:', {
          hayadat: sections.hayadat.length,
          yeshiva: sections.yeshiva.length,
          general: sections.general.length,
          safety: sections.safety.length,
        });

        const safetyContent = document.querySelector('.text-wrapper-15.safety-content');
        if (safetyContent) this.displaySafetyUpdatesWithScrolling(sections.safety, safetyContent);

        const yeshivaImage = document.querySelector('.div-10 img.element-dadfb-ec-b');
        if (yeshivaImage) this.displayYeshivaImagesWithRotation(sections.yeshiva, yeshivaImage);

        const hayadatSection = document.querySelector('section.did-you-know-section');
        if (hayadatSection) {
          const hayadatContent =
            hayadatSection.querySelector('div.text-wrapper-27') ||
            hayadatSection.querySelector('div[role="text"]') ||
            hayadatSection.querySelector('div');
          if (hayadatContent) {
            this.displayUpdatesInDidYouKnow([...sections.general, ...sections.yeshiva], hayadatContent);
          }
        }

        // בעמוד welcome1 - התמונה של "פינת הידעת?" נמצאת בתוך div-11 > div:first-child > img.img
        const hayadatImage =
          (hayadatSection && hayadatSection.querySelector('img')) || document.querySelector('.div-11 .img');
        if (hayadatImage) this.displayHayadatImagesWithRotation(sections.hayadat, hayadatImage);
      } catch (e) {
        safeError('[UPDATES] Error in updateUpdates:', e);
      }
    }

    updateMainAnnouncement(data) {
      try {
        if (!data?.updates || !Array.isArray(data.updates)) return;

        const candidates = this.visibleUpdates(data.updates).filter(update => {
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
          // everything here expired → back to the design's own text
          this.restoreDefaultHtml(target);
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
          this.setSectionHtml(target, allContent.replace(/\n/g, '<br/>'));
        } else {
          this.restoreDefaultHtml(target);
        }
      } catch (e) {
        safeError('[ANNOUNCEMENT] Error in updateMainAnnouncement:', e);
      }
    }

    // ── Rotation ────────────────────────────────────────────────────────────
    // Every rotation below is driven by BoardSchedule.slotAt(), which derives the
    // item to show from the WALL CLOCK. The kiosk reloads the whole page every
    // 15s (board 1 ↔ board 2), so a rotation that restarts at index 0 on every
    // load can never reach index 1 — the board used to freeze on the first item
    // forever. Wall-clock slots survive reloads and keep every screen in a group
    // showing the same item at the same moment.

    schedule(items) {
      try {
        if (window.BoardSchedule && typeof window.BoardSchedule.slotAt === 'function') {
          return window.BoardSchedule.slotAt(items);
        }
      } catch (e) {
        safeWarn('[SCHEDULE] slotAt failed:', e);
      }
      const first = items && items[0];
      const ms = Math.max(3, Number(first && first.displayTime) || 20) * 1000;
      return { index: 0, msUntilNext: ms, total: ms };
    }

    /** Only the updates that are inside their display window right now
     *  (the phone can give every update an end date — see board-schedule.js). */
    visibleUpdates(list) {
      try {
        if (window.BoardSchedule && typeof window.BoardSchedule.activeUpdates === 'function') {
          return window.BoardSchedule.activeUpdates(list);
        }
      } catch (e) {
        safeWarn('[SCHEDULE] activeUpdates failed:', e);
      }
      return Array.isArray(list) ? list : [];
    }

    /** Split the currently-visible updates into the board's four sections. */
    categorizeUpdates(data) {
      const buckets = { hayadat: [], yeshiva: [], general: [], safety: [] };
      this.visibleUpdates(data && data.updates).forEach(update => {
        try {
          const title = (update.title || update.name || '').toLowerCase();
          const type = (update.type || '').toLowerCase();
          const typeOriginal = (update.type || '').trim();

          if (type.includes('דגשי בטיחות') || type.includes('בטיחות') || title.includes('דגשי בטיחות') || title.includes('בטיחות')) {
            buckets.safety.push(update);
          } else if (typeOriginal === 'הידעת?' || type.includes('הידעת') || title.includes('הידעת') ||
                     title.includes('hayadat') || title.includes('ידעת')) {
            buckets.hayadat.push(update);
          } else if (type.includes('ימי ישיבה') || title.includes('ימי ישיבה')) {
            buckets.yeshiva.push(update);
          } else if (type.includes('עדכון כללי') || type.includes('דתי') || type.includes('מטכלי') ||
                     type.includes('שיעורי תורה') || type.includes('תורה') || type.includes('שיעור')) {
            buckets.general.push(update);
          }
        } catch (e) {
          safeWarn('[UPDATES] Error processing update:', e);
        }
      });
      return buckets;
    }

    /** Folder the board's own static images live in (/welcome1, /welcome2 …). */
    boardAssetBase() {
      if (window.BOARD_ASSET_BASE) return window.BOARD_ASSET_BASE;
      try {
        const el = document.querySelector('img[src*="/welcome"], link[href*="/welcome"], script[src*="/welcome"]');
        const raw = (el && (el.src || el.href)) || '';
        const match = raw.match(/\/(welcome[0-9]+)\//);
        if (match) return `/${match[1]}`;
      } catch (e) {
        safeWarn('[ASSETS] Could not detect asset base:', e);
      }
      return '/welcome1';
    }

    /** Uploaded images arrive as /api/media/:id; legacy ones are bare filenames. */
    resolveImageUrl(imageUrl) {
      if (!imageUrl) return '';
      if (/^(https?:)?\/\//.test(imageUrl) || imageUrl.charAt(0) === '/') return imageUrl;
      return `${this.boardAssetBase()}/img/${imageUrl}`;
    }

    /** Point an <img> at an update's image — network first, IndexedDB when offline.
     *  Locks are timestamped and always released, so a failed load can no longer
     *  wedge an element permanently (the old boolean locks leaked on the error
     *  path and that image then never refreshed again). */
    async applyImage(imageElement, finalUrl, altText, lockPrefix) {
      if (!imageElement || !finalUrl) return;

      // Already showing exactly this image → no refetch, no flicker.
      if (imageElement.dataset && imageElement.dataset.boardSrcKey === finalUrl && imageElement.getAttribute('src')) {
        return;
      }

      const lockKey = `${lockPrefix || 'img'}_${finalUrl}`;
      const startedAt = this.imageLoadingLocks.get(lockKey);
      if (startedAt && Date.now() - startedAt < 15000) return; // a load is already in flight
      this.imageLoadingLocks.set(lockKey, Date.now());

      try {
        const resolved = await this.imageCache.loadAndCacheImage(finalUrl);
        const src = resolved || finalUrl;
        if (!imageElement.parentNode) return;

        // Remember the design's own image so the slot can fall back to it when
        // every update in this section has reached the end of its display window.
        if (imageElement.dataset && imageElement.dataset.boardOriginalSrc === undefined) {
          imageElement.dataset.boardOriginalSrc = imageElement.getAttribute('src') || '';
        }
        const previous = imageElement.__boardObjectUrl || null;
        if (imageElement.dataset) imageElement.dataset.boardSrcKey = finalUrl;
        this.cachedImageUrls.set(finalUrl, src);
        if (imageElement.getAttribute('src') !== src) imageElement.src = src;
        imageElement.alt = altText || '';
        imageElement.__boardObjectUrl = src.indexOf('blob:') === 0 ? src : null;
        if (previous && previous !== src) this.imageCache.revokeObjectUrl(previous);
        safeLog('[IMAGE] Showing', finalUrl);
      } catch (e) {
        safeWarn('[IMAGE] Failed to show image:', finalUrl, e);
      } finally {
        this.imageLoadingLocks.delete(lockKey);
      }
    }

    /** Put the design's own image back when a section has nothing to show, so an
     *  update that just expired cannot linger on the screen. */
    restoreDefaultImage(imageElement) {
      try {
        if (!imageElement || !imageElement.dataset) return;
        const original = imageElement.dataset.boardOriginalSrc;
        if (original === undefined) return; // the board never replaced it
        const previous = imageElement.__boardObjectUrl || null;
        if (imageElement.getAttribute('src') !== original) imageElement.src = original;
        imageElement.__boardObjectUrl = null;
        delete imageElement.dataset.boardSrcKey;
        if (previous) this.imageCache.revokeObjectUrl(previous);
      } catch (e) {
        safeWarn('[IMAGE] Could not restore default image:', e);
      }
    }

    setSectionHtml(element, html) {
      if (!element) return;
      if (element.dataset && element.dataset.boardOriginalHtml === undefined) {
        element.dataset.boardOriginalHtml = element.innerHTML;
      }
      if (element.innerHTML !== html) element.innerHTML = html;
    }

    restoreDefaultHtml(element) {
      try {
        if (!element || !element.dataset) return;
        const original = element.dataset.boardOriginalHtml;
        if (original === undefined) return;
        if (element.innerHTML !== original) element.innerHTML = original;
      } catch (e) {
        safeWarn('[UPDATES] Could not restore default text:', e);
      }
    }

    // — "פינת הידעת?" text —
    displayUpdatesInDidYouKnow(updates, contentElement) {
      try {
        if (contentElement) this.didYouKnowElement = contentElement;
        this.didYouKnowUpdates = updates || [];
        if (this.updatesRotationInterval) {
          clearTimeout(this.updatesRotationInterval);
          this.updatesRotationInterval = null;
        }
        this.tickDidYouKnow();
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in displayUpdatesInDidYouKnow:', e);
      }
    }

    tickDidYouKnow() {
      try {
        const items = this.didYouKnowUpdates || [];
        const element = this.didYouKnowElement;
        if (!element) return;
        if (!items.length) { this.restoreDefaultHtml(element); return; }

        const slot = this.schedule(items);
        this.currentUpdateIndex = slot.index;
        this.showCurrentUpdateInDidYouKnow(items, element);

        const timeoutId = setTimeout(() => this.tickDidYouKnow(), Math.max(1000, slot.msUntilNext));
        this.addTimeout(timeoutId);
        this.updatesRotationInterval = timeoutId;
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in tickDidYouKnow:', e);
      }
    }

    showCurrentUpdateInDidYouKnow(updates, contentElement) {
      try {
        if (!updates.length || !contentElement) return;
        const currentUpdate = updates[this.currentUpdateIndex];
        if (!currentUpdate) return;
        const content = currentUpdate.content || currentUpdate.text || '';
        if (content) this.setSectionHtml(contentElement, content.replace(/\n/g, '<br/>'));
      } catch (e) {
        safeError('[DIDYOUKNOW] Error in showCurrentUpdateInDidYouKnow:', e);
      }
    }

    // — "ימי ישיבה" images —
    displayYeshivaImagesWithRotation(updates, imageElement) {
      try {
        if (imageElement) this.yeshivaImageElement = imageElement;
        this.yeshivaUpdates = updates || [];
        if (this.yeshivaImageRotationInterval) {
          clearTimeout(this.yeshivaImageRotationInterval);
          this.yeshivaImageRotationInterval = null;
        }
        this.tickYeshivaImage();
      } catch (e) {
        safeError('[YESHIVA] Error in displayYeshivaImagesWithRotation:', e);
      }
    }

    tickYeshivaImage() {
      try {
        const items = this.yeshivaUpdates || [];
        const element = this.yeshivaImageElement;
        if (!element) return;
        if (!items.length) { this.restoreDefaultImage(element); return; }

        const slot = this.schedule(items);
        this.yeshivaImageIndex = slot.index;
        this.showCurrentYeshivaImage(items, element);

        const timeoutId = setTimeout(() => this.tickYeshivaImage(), Math.max(1000, slot.msUntilNext));
        this.addTimeout(timeoutId);
        this.yeshivaImageRotationInterval = timeoutId;
      } catch (e) {
        safeError('[YESHIVA] Error in tickYeshivaImage:', e);
      }
    }

    async showCurrentYeshivaImage(updates, imageElement) {
      try {
        const items = updates || [];
        const element = imageElement || this.yeshivaImageElement;
        const currentUpdate = items[this.yeshivaImageIndex];
        if (!currentUpdate || !element) return;

        const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
        if (!imageUrl) {
          safeWarn('[YESHIVA-IMAGE] Update has no image:', currentUpdate.title);
          return;
        }
        await this.applyImage(
          element,
          this.resolveImageUrl(imageUrl),
          currentUpdate.title || currentUpdate.name || 'תמונה ימי ישיבה',
          'yeshiva',
        );
      } catch (e) {
        safeError('[YESHIVA-IMAGE] Error in showCurrentYeshivaImage:', e);
      }
    }

    // — "הידעת?" images —
    displayHayadatImagesWithRotation(updates, imageElement) {
      try {
        if (imageElement) this.hayadatImageElement = imageElement;
        this.hayadatUpdates = updates || [];
        if (this.hayadatImageRotationInterval) {
          clearTimeout(this.hayadatImageRotationInterval);
          this.hayadatImageRotationInterval = null;
        }
        this.tickHayadatImage();
      } catch (e) {
        safeError('[HAYADAT] Error in displayHayadatImagesWithRotation:', e);
      }
    }

    tickHayadatImage() {
      try {
        const items = this.hayadatUpdates || [];
        const element = this.hayadatImageElement;
        if (!element) return;
        if (!items.length) { this.restoreDefaultImage(element); return; }

        const slot = this.schedule(items);
        this.hayadatImageIndex = slot.index;
        this.showCurrentHayadatImage(items, element);

        const timeoutId = setTimeout(() => this.tickHayadatImage(), Math.max(1000, slot.msUntilNext));
        this.addTimeout(timeoutId);
        this.hayadatImageRotationInterval = timeoutId;
      } catch (e) {
        safeError('[HAYADAT] Error in tickHayadatImage:', e);
      }
    }

    async showCurrentHayadatImage(updates, imageElement) {
      try {
        const items = updates || [];
        const element = imageElement || this.hayadatImageElement;
        const currentUpdate = items[this.hayadatImageIndex];
        if (!currentUpdate || !element) return;

        const imageUrl = currentUpdate.imageUrl || currentUpdate.image || currentUpdate.img;
        if (!imageUrl) {
          safeWarn('[HAYADAT-IMAGE] Update has no image:', currentUpdate.title);
          return;
        }
        await this.applyImage(
          element,
          this.resolveImageUrl(imageUrl),
          currentUpdate.title || currentUpdate.name || 'תמונה הידעת',
          'hayadat',
        );
      } catch (e) {
        safeError('[HAYADAT-IMAGE] Error in showCurrentHayadatImage:', e);
      }
    }

    // — "דגשי בטיחות" text —
    displaySafetyUpdatesWithScrolling(updates, contentElement) {
      try {
        if (contentElement) this.safetyElement = contentElement;
        this.safetyUpdates = updates || [];
        if (this.safetyRotationInterval) {
          clearTimeout(this.safetyRotationInterval);
          this.safetyRotationInterval = null;
        }
        this.tickSafetyUpdate();
      } catch (e) {
        safeError('[SAFETY] Error in displaySafetyUpdatesWithScrolling:', e);
      }
    }

    tickSafetyUpdate() {
      try {
        const items = this.safetyUpdates || [];
        const element = this.safetyElement;
        if (!element) return;
        if (!items.length) { this.restoreDefaultHtml(element); return; }

        const slot = this.schedule(items);
        this.safetyUpdateIndex = slot.index;
        this.showCurrentSafetyUpdate(items, element);

        const timeoutId = setTimeout(() => this.tickSafetyUpdate(), Math.max(1000, slot.msUntilNext));
        this.addTimeout(timeoutId);
        this.safetyRotationInterval = timeoutId;
      } catch (e) {
        safeError('[SAFETY] Error in tickSafetyUpdate:', e);
      }
    }

    showCurrentSafetyUpdate(updates, contentElement) {
      try {
        if (!updates.length || !contentElement) return;
        const currentUpdate = updates[this.safetyUpdateIndex];
        if (!currentUpdate) return;
        const content = currentUpdate.content || currentUpdate.text || currentUpdate.title || currentUpdate.name;
        if (content) this.setSectionHtml(contentElement, content.replace(/\n/g, '<br/>'));
      } catch (e) {
        safeError('[SAFETY] Error in showCurrentSafetyUpdate:', e);
      }
    }

    /** Re-render when the next update's display window closes, so an update
     *  disappears on time instead of at the next 30s poll. */
    scheduleExpirySweep(data) {
      try {
        if (this.expirySweepTimer) {
          clearTimeout(this.expirySweepTimer);
          this.expirySweepTimer = null;
        }
        if (!window.BoardSchedule || typeof window.BoardSchedule.msUntilNextExpiry !== 'function') return;
        const ms = window.BoardSchedule.msUntilNextExpiry(data && data.updates);
        if (ms === null || ms === undefined || ms <= 0) return;

        const timeoutId = setTimeout(() => {
          this.expirySweepTimer = null;
          if (this.content) {
            safeLog('[EXPIRY] An update reached the end of its display window');
            this.updateAll(this.content);
          }
        }, Math.min(ms + 500, 6 * 60 * 60 * 1000));
        this.addTimeout(timeoutId);
        this.expirySweepTimer = timeoutId;
      } catch (e) {
        safeError('[EXPIRY] Error scheduling expiry sweep:', e);
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

    /** "מוקדי תמיכה" — the support numbers in the left column of board 1.
     *  A missing list means "never configured": the board then keeps the numbers
     *  baked into its own HTML instead of blanking the column. */
    updateSupportLines(data) {
      try {
        var target = document.querySelector('.p.support-lines');
        if (!target) return; // this board has no support column
        var lines = data && data.supportLines;
        // not configured (or cleared) -> put the board's own numbers back
        if (!Array.isArray(lines) || !lines.length) { this.restoreDefaultHtml(target); return; }

        var html = lines
          .map(function (line) {
            var label = escapeHtml((line && line.label) || '');
            var phone = escapeHtml((line && line.phone) || '');
            return (
              '<span class="span">' + label + '<br /></span>' +
              '<span class="text-wrapper-8">' + phone + '<br /><br /></span>'
            );
          })
          .join('');
        this.setSectionHtml(target, html);
        safeLog('[SUPPORT] Rendered', lines.length, 'support lines');
      } catch (e) {
        safeError('[SUPPORT] Error in updateSupportLines:', e);
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

        const hasLetterContainer = document.querySelector('.div-wrapper');
        if (!hasLetterContainer) {
          safeLog('[LETTER] Letter display not available in this welcome screen');
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
        this.updateSupportLines(data);
        this.updateShuttleTimes(data);
        this.updateMainAnnouncement(data);
        
        this.notifyParentOfDisplayTime(data);
        this.scheduleExpirySweep(data);
        
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

        const sections = this.categorizeUpdates(data);
        const totalTime = Math.max(
          this.calculateTotalDisplayTime(sections.hayadat),
          this.calculateTotalDisplayTime(sections.yeshiva),
          this.calculateTotalDisplayTime([...sections.general, ...sections.yeshiva]),
          this.calculateTotalDisplayTime(sections.safety)
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

    setupPeriodicCleanup() {
      try {
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
        }
        const intervalId = setInterval(async () => {
          try {
            safeLog('[CLEANUP] Starting periodic cleanup');
            this.cleanupLocalStorage();
            this.imageCache.cleanupUnusedObjectUrls();
            await this.imageCache.cleanupIndexedDB();
            this.cleanupOldAbortControllers();
            safeLog('[CLEANUP] Periodic cleanup completed');
          } catch (e) {
            safeError('[CLEANUP] Error in periodic cleanup:', e);
          }
        }, 30 * 60 * 1000);
        this.addInterval(intervalId);
        this.cleanupInterval = intervalId;
      } catch (e) {
        safeError('[CLEANUP] Error setting up periodic cleanup:', e);
      }
    }

    setupObjectUrlCleanup() {
      try {
        if (this.objectUrlCleanupInterval) {
          clearInterval(this.objectUrlCleanupInterval);
        }
        const intervalId = setInterval(() => {
          try {
            this.imageCache.cleanupUnusedObjectUrls();
          } catch (e) {
            safeWarn('[CLEANUP] Error in object URL cleanup:', e);
          }
        }, 10 * 60 * 1000);
        this.addInterval(intervalId);
        this.objectUrlCleanupInterval = intervalId;
      } catch (e) {
        safeError('[CLEANUP] Error setting up object URL cleanup:', e);
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
        this.cleanupLocalStorage();
        this.loadContent();
        this.setupPeriodicUpdates();
        this.setupOnlineOfflineListeners();
        this.setupPeriodicCleanup();
        this.setupObjectUrlCleanup();
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
        if (this.expirySweepTimer) {
          clearTimeout(this.expirySweepTimer);
          this.expirySweepTimer = null;
        }

        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }
        if (this.objectUrlCleanupInterval) {
          clearInterval(this.objectUrlCleanupInterval);
          this.objectUrlCleanupInterval = null;
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
