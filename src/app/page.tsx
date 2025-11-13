"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

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
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%)',
        zIndex: 0
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        color: 'white',
        padding: '40px',
        maxWidth: '800px',
        width: '90%'
      }}>
        <h1 style={{
          fontSize: '56px',
          fontWeight: 'bold',
          marginBottom: '24px',
          textShadow: '2px 2px 8px rgba(0, 0, 0, 0.8)',
          lineHeight: '1.2'
        }}>
          לוח רבנות
        </h1>
        
        <p style={{
          fontSize: '24px',
          marginBottom: '48px',
          textShadow: '1px 1px 4px rgba(0, 0, 0, 0.8)',
          opacity: 0.95
        }}>
          מערכת ניהול לוחות רבנות
        </p>

        <div style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => router.push('/claim')}
            style={{
              padding: '18px 36px',
              fontSize: '20px',
              fontWeight: 'bold',
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#1a1a1a',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.3s ease',
              minWidth: '200px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
            }}
          >
            שיוך לוח
          </button>
        </div>
      </div>
    </div>
  );
}
