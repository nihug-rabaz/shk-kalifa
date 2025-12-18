"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import BoardManager from '@/utils/BoardManager';

export default function DisplayPage() {
  const router = useRouter();
  const [currentBoard, setCurrentBoard] = useState(2);
  const [isLinked, setIsLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [boardId, setBoardId] = useState<string>('');
  const boardTimesRef = useRef<{ [key: number]: number }>({ 1: 60000, 2: 60000 });
  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkLinked = async () => {
      try {
        const boardInfo = BoardManager.getBoardInfo();
        const id = BoardManager.getBoardId();
        setBoardId(id);
        
        if (!id) {
          router.push('/claim');
          return;
        }
        
        try {
          const response = await fetch(`/api/check-claim-status?board_id=${id}`);
          if (response.ok) {
            const data = await response.json();
            const isLinked = data.linked === true || 
                           data.linked === 'true' || 
                           (data.logical_board_id && data.logical_board_id > 0);
            
            if (!isLinked) {
              BoardManager.clearBoardInfo();
              router.push('/claim');
              return;
            }
            
            const updatedInfo = {
              linked: true,
              user_id: data.user_id,
              name: data.name,
              logical_board_id: data.logical_board_id
            };
            BoardManager.setBoardInfo(updatedInfo);
            setIsLinked(true);
            setIsLoading(false);
          } else {
            const linked = boardInfo?.linked === true || 
                          (boardInfo?.logical_board_id && boardInfo.logical_board_id > 0);
            
            if (!linked) {
              router.push('/claim');
              return;
            }
            
            setIsLinked(true);
            setIsLoading(false);
          }
        } catch (error) {
          console.warn('Error checking board status from server:', error);
          const linked = boardInfo?.linked === true || 
                        (boardInfo?.logical_board_id && boardInfo.logical_board_id > 0);
          
          if (!linked) {
            router.push('/claim');
            return;
          }
          
          setIsLinked(true);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking board info:', error);
        router.push('/claim');
      }
    };

    checkLinked();
    
    const statusCheckInterval = setInterval(checkLinked, 30000);
    
    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [router]);

  useEffect(() => {
    if (!isLinked) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BOARD_DISPLAY_TIME') {
        const iframeRefs = (window as any).__iframeRefs || {};
        let boardNum = 2;
        
        if (iframeRefs[2] && event.source === iframeRefs[2].contentWindow) {
          boardNum = 2;
        }
        
        const totalTime = event.data.totalTime || 60000;
        boardTimesRef.current[boardNum] = totalTime;
        console.log(`[DISPLAY] Board ${boardNum} display time updated: ${totalTime}ms`);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current);
      }
    };
  }, [isLinked]);

  if (isLoading || !isLinked) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff'
      }}>
        <div style={{ fontSize: '24px' }}>טוען...</div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      direction: 'ltr',
      background: '#000'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <iframe
          ref={(el) => {
            if (el) {
              const iframeRefs = (window as any).__iframeRefs || {};
              iframeRefs[2] = el;
              (window as any).__iframeRefs = iframeRefs;
            }
          }}
          src={`/api/welcome-html?board=2&board_id=${boardId}`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent'
          }}
          title="מסך שני"
          allowFullScreen
          scrolling="no"
        />
      </div>
    </div>
  );
}
