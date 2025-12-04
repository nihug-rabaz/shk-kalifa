"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect home (/) directly to the claim page
    router.replace('/claim');
  }, [router]);

  return (
    null
  );
}
