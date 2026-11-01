'use client';

import { useEffect } from 'react';
import BoardManager from '@/utils/BoardManager';

const DEFAULT_TITLE = 'שיוך לוח - Shchakim';

export function BoardTitle() {
  useEffect(() => {
    const info = BoardManager.getBoardInfo();
    const title = info?.display_name || info?.name || DEFAULT_TITLE;
    document.title = title;
  }, []);
  return null;
}
