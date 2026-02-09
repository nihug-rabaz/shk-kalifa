"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BoardManager from '@/utils/BoardManager';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (BoardManager.isFixedBoard()) {
      router.replace('/display');
    } else {
      router.replace('/claim');
    }
  }, [router]);

  return null;
}
