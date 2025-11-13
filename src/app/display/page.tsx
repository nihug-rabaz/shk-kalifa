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
        console.log('Display page - board info:', boardInfo);
        
        const linked = boardInfo?.linked === true || 
                      boardInfo?.linked === 'true' || 
                      (boardInfo?.logical_board_id && boardInfo.logical_board_id > 0);
        
        if (!linked) {
          console.log('Not linked, redirecting to claim');
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
        background: '#f5f5f5',
        gap: '20px'
      }}>
        <div style={{ fontSize: '24px' }}>טוען...</div>
        <div style={{ fontSize: '16px', color: '#666' }}>מעבר למסך התצוגה</div>
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
          src={`/api/board-html?board=1`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            transform: 'scale(1)',
            transformOrigin: 'center center'
          }}
          title="לוח רבנות 1"
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
          src={`/api/board-html?board=2`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            transform: 'scale(1)',
            transformOrigin: 'center center'
          }}
          title="לוח רבנות 2"
          allowFullScreen
          scrolling="no"
        />
      </div>

      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '12px',
        zIndex: 10,
        padding: '8px 16px',
        background: 'rgba(0, 0, 0, 0.5)',
        borderRadius: '20px',
        backdropFilter: 'blur(10px)'
      }}>
        <div 
          style={{
            width: currentBoard === 1 ? '24px' : '12px',
            height: '12px',
            borderRadius: '6px',
            background: currentBoard === 1 ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }} 
          onClick={() => setCurrentBoard(1)} 
        />
        <div 
          style={{
            width: currentBoard === 2 ? '24px' : '12px',
            height: '12px',
            borderRadius: '6px',
            background: currentBoard === 2 ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }} 
          onClick={() => setCurrentBoard(2)} 
        />
      </div>
    </div>
  );
}
