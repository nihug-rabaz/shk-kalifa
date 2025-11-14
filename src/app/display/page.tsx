"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BoardManager from '@/utils/BoardManager';

export default function DisplayPage() {
  const router = useRouter();
  const [currentBoard, setCurrentBoard] = useState(1);
  const [isLinked, setIsLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkLinked = () => {
      try {
        const boardInfo = BoardManager.getBoardInfo();
        
        const linked = boardInfo?.linked === true || 
                      boardInfo?.linked === 'true' || 
                      (boardInfo?.logical_board_id && boardInfo.logical_board_id > 0);
        
        if (!linked) {
          router.push('/claim');
          return;
        }
        
        setIsLinked(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking board info:', error);
        router.push('/claim');
      }
    };

    checkLinked();
  }, [router]);

  useEffect(() => {
    if (!isLinked) return;

    const interval = setInterval(() => {
      setCurrentBoard(prev => prev === 1 ? 2 : 1);
    }, 10000);

    return () => clearInterval(interval);
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
      direction: 'rtl',
      background: '#000'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: currentBoard === 1 ? 1 : 0,
        transition: 'opacity 1.5s ease-in-out',
        width: '100%',
        height: '100%',
        zIndex: currentBoard === 1 ? 2 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <iframe
          src={`/api/welcome-html?board=1`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent'
          }}
          title="מסך ראשון"
          allowFullScreen
          scrolling="no"
        />
      </div>
      
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: currentBoard === 2 ? 1 : 0,
        transition: 'opacity 1.5s ease-in-out',
        width: '100%',
        height: '100%',
        zIndex: currentBoard === 2 ? 2 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <iframe
          src={`/api/welcome-html?board=2`}
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
