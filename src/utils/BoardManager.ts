// לוח קבוע (מפקדת הרבנות הצבאית) – בלי ברקוד/QR, תמיד מזהה כלוח 1
const FIXED_BOARD_ID = '1';

const FIXED_BOARD_INFO = {
  linked: true as const,
  logical_board_id: 1,
  name: 'מפקדת הרבנות הצבאית',
};

interface BoardInfo {
  linked: boolean;
  user_id?: string;
  name?: string;
  logical_board_id?: number;
}

class BoardManager {
  private static readonly BOARD_ID_KEY = 'shchakim_board_id';
  private static readonly BOARD_INFO_KEY = 'shchakim_board_info';

  static isFixedBoard(): boolean {
    return !!FIXED_BOARD_ID;
  }

  static generateBoardId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `BOARD${timestamp}${random}`.toUpperCase();
  }

  private static getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    try {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        return parts.pop()?.split(';').shift() || null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private static setCookie(name: string, value: string, days: number = 365): void {
    if (typeof document === 'undefined') return;
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    } catch {
    }
  }

  private static memoryStorage: {
    boardId?: string;
    boardInfo?: BoardInfo;
  } = {};

  static getBoardId(): string {
    if (FIXED_BOARD_ID) {
      return FIXED_BOARD_ID;
    }
    if (this.memoryStorage.boardId) {
      return this.memoryStorage.boardId;
    }

    if (typeof window === 'undefined') {
      const id = this.generateBoardId();
      this.memoryStorage.boardId = id;
      return id;
    }

    try {
      const stored = localStorage.getItem(this.BOARD_ID_KEY);
      if (stored) {
        this.memoryStorage.boardId = stored;
        return stored;
      }
    } catch {
    }

    try {
      const stored = sessionStorage.getItem(this.BOARD_ID_KEY);
      if (stored) {
        this.memoryStorage.boardId = stored;
        return stored;
      }
    } catch {
    }

    const cookieId = this.getCookie(this.BOARD_ID_KEY);
    if (cookieId) {
      this.memoryStorage.boardId = cookieId;
      return cookieId;
    }

    const id = this.generateBoardId();
    this.memoryStorage.boardId = id;
    
    try {
      localStorage.setItem(this.BOARD_ID_KEY, id);
    } catch {
      try {
        sessionStorage.setItem(this.BOARD_ID_KEY, id);
      } catch {
        this.setCookie(this.BOARD_ID_KEY, id);
      }
    }
    
    return id;
  }

  static setBoardId(id: string): void {
    this.memoryStorage.boardId = id;

    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.BOARD_ID_KEY, id);
      return;
    } catch {
    }

    try {
      sessionStorage.setItem(this.BOARD_ID_KEY, id);
      return;
    } catch {
    }

    this.setCookie(this.BOARD_ID_KEY, id);
  }

  static getBoardInfo(): BoardInfo | null {
    if (FIXED_BOARD_ID) {
      return { ...FIXED_BOARD_INFO };
    }
    if (this.memoryStorage.boardInfo) {
      return this.memoryStorage.boardInfo;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const info = localStorage.getItem(this.BOARD_INFO_KEY);
      if (info) {
        const parsed = JSON.parse(info);
        this.memoryStorage.boardInfo = parsed;
        return parsed;
      }
    } catch {
    }

    try {
      const info = sessionStorage.getItem(this.BOARD_INFO_KEY);
      if (info) {
        const parsed = JSON.parse(info);
        this.memoryStorage.boardInfo = parsed;
        return parsed;
      }
    } catch {
    }

    const cookieInfo = this.getCookie(this.BOARD_INFO_KEY);
    if (cookieInfo) {
      try {
        const parsed = JSON.parse(cookieInfo);
        this.memoryStorage.boardInfo = parsed;
        return parsed;
      } catch {
      }
    }

    return null;
  }

  static setBoardInfo(info: BoardInfo): void {
    this.memoryStorage.boardInfo = info;
    const infoStr = JSON.stringify(info);

    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.BOARD_INFO_KEY, infoStr);
      return;
    } catch {
    }

    try {
      sessionStorage.setItem(this.BOARD_INFO_KEY, infoStr);
      return;
    } catch {
    }

    this.setCookie(this.BOARD_INFO_KEY, infoStr);
  }

  static clearBoardInfo(): void {
    this.memoryStorage.boardId = undefined;
    this.memoryStorage.boardInfo = undefined;

    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(this.BOARD_INFO_KEY);
      localStorage.removeItem(this.BOARD_ID_KEY);
    } catch {
    }

    try {
      sessionStorage.removeItem(this.BOARD_INFO_KEY);
      sessionStorage.removeItem(this.BOARD_ID_KEY);
    } catch {
    }

    if (typeof document !== 'undefined') {
      try {
        document.cookie = `${this.BOARD_INFO_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
        document.cookie = `${this.BOARD_ID_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      } catch {
      }
    }
  }
}

export default BoardManager;
