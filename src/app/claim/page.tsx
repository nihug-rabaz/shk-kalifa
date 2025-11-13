"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BoardManager from '@/utils/BoardManager';

interface BoardInfo {
  linked: boolean;
  user_id?: string;
  name?: string;
  logical_board_id?: number;
}

const buildQrUrl = (data: string, size: number = 300, margin: number = 0): string => {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}&margin=${margin}`;
};

export default function ClaimPage() {
  const router = useRouter();
  const [boardId, setBoardId] = useState<string>('');
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [claimUrl, setClaimUrl] = useState<string>('');

  useEffect(() => {
    let checkInterval: NodeJS.Timeout | null = null;
    let currentBoardId = '';

    const initialize = async () => {
      try {
        const info = BoardManager.getBoardInfo();
        if (info?.linked) {
          router.push('/display');
          return;
        }

        const id = BoardManager.getBoardId();
        currentBoardId = id;
        setBoardId(id);
        setBoardInfo(info);

        if (typeof window !== 'undefined') {
          const url = `https://shchakim.rabaz.co.il/claim?id=${id}`;
          setClaimUrl(url);
          const qr = buildQrUrl(url, 500);
          setQrUrl(qr);
        }

        const checkStatus = async () => {
          if (isChecking) return;
          
          setIsChecking(true);
          try {
            const response = await fetch(`/api/check-claim-status?board_id=${currentBoardId}`);
            if (response.ok) {
              const data = await response.json();
              console.log('Board status check:', data);
              
              const isLinked = data.linked === true || data.linked === 'true' || (data.logical_board_id && data.logical_board_id > 0);
              
              if (isLinked) {
                const newInfo: BoardInfo = {
                  linked: true,
                  user_id: data.user_id,
                  name: data.name,
                  logical_board_id: data.logical_board_id
                };
                
                BoardManager.setBoardInfo(newInfo);
                setBoardInfo(newInfo);
                
                if (checkInterval) {
                  clearInterval(checkInterval);
                }
                
                setTimeout(() => {
                  router.push('/display');
                }, 1500);
              }
            }
          } catch (error) {
            console.error('Failed to check claim status:', error);
          } finally {
            setIsChecking(false);
          }
        };

        checkInterval = setInterval(checkStatus, 2000);
        checkStatus();
      } catch (error) {
        console.error('Error initializing board:', error);
        const id = BoardManager.getBoardId();
        setBoardId(id);
        if (typeof window !== 'undefined') {
          const url = `https://shchakim.rabaz.co.il/claim?id=${id}`;
          setClaimUrl(url);
          const qr = buildQrUrl(url, 500);
          setQrUrl(qr);
        }
      }
    };

    initialize();

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [router]);

  const handleGoToDisplay = () => {
    router.push('/display');
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundImage: 'url(/background.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      direction: 'rtl',
      overflow: 'auto',
      padding: '20px'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 0
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '24px',
        padding: '48px',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '36px',
          fontWeight: 'bold',
          color: '#1a1a1a'
        }}>
          שיוך לוח
        </h1>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          background: 'rgba(240, 240, 240, 0.5)',
          borderRadius: '12px',
          width: '100%'
        }}>
          <div>
            <strong>מזהה לוח:</strong>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '16px',
              padding: '12px',
              background: 'white',
              borderRadius: '8px',
              marginTop: '8px',
              wordBreak: 'break-all'
            }}>
              {boardId || 'טוען...'}
            </div>
          </div>

          {boardInfo?.linked && (
            <div style={{
              padding: '16px',
              background: '#d4edda',
              borderRadius: '8px',
              color: '#155724',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              fontSize: '18px'
            }}>
              <span style={{ fontSize: '24px' }}>✓</span>
              <div>
                <strong>משויך ללוח:</strong> {boardInfo.name || `לוח ${boardInfo.logical_board_id}`}
              </div>
              <button
                onClick={handleGoToDisplay}
                style={{
                  padding: '12px 24px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                מעבר למסך התצוגה
              </button>
            </div>
          )}
        </div>

        {qrUrl && !boardInfo?.linked && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            padding: '30px',
            background: 'white',
            borderRadius: '16px',
            width: '100%'
          }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '20px',
              color: '#333'
            }}>
              סרוק QR Code מהאפליקציה
            </div>
            <img 
              src={qrUrl} 
              alt="QR Code" 
              style={{
                width: '300px',
                height: '300px',
                border: '3px solid #007bff',
                borderRadius: '12px',
                padding: '10px',
                background: 'white'
              }}
              onError={(e) => {
                console.error('QR Code failed to load');
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            <div style={{
              fontSize: '16px',
              color: '#666',
              padding: '12px',
              background: '#f8f9fa',
              borderRadius: '8px',
              width: '100%'
            }}>
              ממתין לשיוך מהאפליקציה...
            </div>
            {claimUrl && (
              <div style={{
                fontSize: '14px',
                color: '#333',
                background: '#eef2ff',
                padding: '10px 14px',
                borderRadius: '8px',
                width: '100%',
                wordBreak: 'break-all',
                direction: 'ltr'
              }}>
                {claimUrl}
              </div>
            )}
          </div>
        )}

        {!qrUrl && !boardInfo?.linked && (
          <div style={{
            padding: '20px',
            background: '#fff3cd',
            borderRadius: '12px',
            width: '100%',
            fontSize: '16px',
            color: '#856404'
          }}>
            טוען QR Code...
          </div>
        )}
      </div>
    </div>
  );
}
