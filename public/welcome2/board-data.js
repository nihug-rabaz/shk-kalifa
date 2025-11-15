class BoardDataLoader {
  constructor() {
    this.boardId = window.BOARD_ID || '';
    this.apiBase = '/api/display/content';
    this.content = null;
    this.updateInterval = null;
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
          this.updateAll(data);
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
            
            this.updateAll(data);
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
      const titleElement = document.querySelector('.text-wrapper');
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

  updateRabzrLetter(data) {
    if (!data?.letter) return;

    const articleColumns = document.querySelectorAll('.article-column .text-wrapper-8, .article-column .text-wrapper-7, .article-column .text-wrapper-6');
    
    if (data.letter.title) {
      const titleElement = document.querySelector('.article-header .p');
      if (titleElement) {
        titleElement.textContent = data.letter.title;
      }
    }

    if (data.letter.content) {
      if (typeof data.letter.content === 'string') {
        // אם זה מחרוזת אחת, חלק אותה לעמודות
        const paragraphs = data.letter.content.split('\n\n').filter(p => p.trim());
        paragraphs.forEach((para, index) => {
          if (articleColumns[index]) {
            articleColumns[index].innerHTML = para.replace(/\n/g, '<br/>');
          }
        });
      } else if (Array.isArray(data.letter.content)) {
        data.letter.content.forEach((content, index) => {
          if (articleColumns[index]) {
            articleColumns[index].innerHTML = typeof content === 'string' ? content.replace(/\n/g, '<br/>') : content;
          }
        });
      }
    }
  }

  async loadHalacha() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      console.log('[HALACHA] Loading halacha for date:', date);
      const response = await fetch(`/api/halacha/daily?date=${date}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[HALACHA] Received data:', data);
        this.updateHalacha(data);
      } else {
        console.error('[HALACHA] Failed to load halacha, status:', response.status);
      }
    } catch (error) {
      console.error('[HALACHA] Error loading halacha:', error);
    }
  }

  updateHalacha(halachaData) {
    console.log('[HALACHA] Update halacha called with data:', halachaData);
    
    if (!halachaData?.items || !Array.isArray(halachaData.items)) {
      console.warn('[HALACHA] No items found in halacha data');
      return;
    }

    const halachaSection = document.querySelector('section.halacha-section');
    if (!halachaSection) {
      console.warn('[HALACHA] halacha-section not found');
      return;
    }

    const halachaContent = halachaSection.querySelector('div.halacha-content');
    if (!halachaContent) {
      console.warn('[HALACHA] halacha-content div not found');
      return;
    }

    console.log('[HALACHA] Found halacha section, items count:', halachaData.items.length);

    // עדכון עד 2 הלכות (יש 2 אלמנטים במסך)
    const articles = halachaContent.querySelectorAll('article');
    console.log('[HALACHA] Found articles:', articles.length);
    
    halachaData.items.slice(0, 2).forEach((item, index) => {
      if (articles[index]) {
        const article = articles[index];
        const pElement = article.querySelector('p.text-wrapper-4') || 
                         article.querySelector('p.text-wrapper-5') || 
                         article.querySelector('p');
        
        if (pElement) {
          const text = item.summary || item.text || item.content || (typeof item === 'string' ? item : '');
          if (text) {
            console.log(`[HALACHA] Updating article ${index + 1} with text:`, text.substring(0, 50));
            
            // הצגת הטקסט ישירות תחילה
            pElement.textContent = text;
            pElement.style.setProperty('visibility', 'visible', 'important');
            pElement.style.setProperty('display', 'block', 'important');
            pElement.style.setProperty('opacity', '1', 'important');
            pElement.style.setProperty('color', '#1c4080', 'important');
            pElement.style.setProperty('position', 'relative', 'important');
            pElement.style.setProperty('z-index', '99', 'important');
            
            // בדיקה אם הטקסט חורג מהגובה המקסימלי
            setTimeout(() => {
              const elementHeight = pElement.scrollHeight;
              const maxHeight = 340;
              
              console.log(`[HALACHA] Article ${index + 1} - elementHeight: ${elementHeight}, maxHeight: ${maxHeight}`);
              
              if (elementHeight > maxHeight) {
                // הטקסט גדול מדי - נוסיף גלילה
                console.log(`[HALACHA] Article ${index + 1} - text exceeds max height, adding scrolling`);
                
                // יצירת wrapper פנימי לגלילה
                let textWrapper = pElement.querySelector('.halacha-text-wrapper');
                if (!textWrapper) {
                  textWrapper = document.createElement('div');
                  textWrapper.className = 'halacha-text-wrapper';
                  pElement.innerHTML = '';
                  pElement.appendChild(textWrapper);
                }
                
                // יצירת עותק של הטקסט להמשך הגלילה
                const textCopy = text + ' • ' + text;
                textWrapper.textContent = textCopy;
                
                pElement.classList.add('scrolling');
                
                // חישוב זמן האנימציה לפי אורך הטקסט
                const textLength = text.length;
                const animationDuration = Math.max(30, textLength * 0.15);
                pElement.style.setProperty('--scroll-duration', `${animationDuration}s`);
              } else {
                // הטקסט נכנס - נשאיר אותו רגיל
                pElement.classList.remove('scrolling');
                const textWrapper = pElement.querySelector('.halacha-text-wrapper');
                if (textWrapper) {
                  textWrapper.remove();
                  pElement.textContent = text;
                }
              }
            }, 200);
            
            article.style.setProperty('visibility', 'visible', 'important');
            article.style.setProperty('display', 'block', 'important');
          } else {
            console.warn(`[HALACHA] No text found for item ${index + 1}:`, item);
          }
        } else {
          console.warn(`[HALACHA] P element not found in article ${index + 1}`);
        }
      } else {
        console.warn(`[HALACHA] Article ${index + 1} not found`);
      }
    });
  }

  updateAll(data) {
    if (!data) return;
    
    this.updateBoardInfo(data);
    this.updateTheme(data);
    this.updateRabzrLetter(data);
    
    // טעינת הלכה יומית מה-API נפרד
    this.loadHalacha();
    
    this.notifyParentOfDisplayTime(data);
  }

  notifyParentOfDisplayTime(data) {
    const totalTime = 60000;
    
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
        await this.loadHalacha();
      }
    }, 60000);
  }

  start() {
    this.loadContent();
    // טעינת הלכה יומית - מחכה קצת כדי לוודא שה-DOM נטען
    setTimeout(() => {
      this.loadHalacha();
    }, 500);
    this.setupPeriodicUpdates();
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
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
