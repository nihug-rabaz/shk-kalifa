"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  // The display route handles screen identity + QR pairing itself.
  useEffect(() => {
    router.replace('/display');
  }, [router]);

  return null;
}
