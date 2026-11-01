'use client';
import { useRouter } from 'next/navigation';

export function AppBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: boolean | string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="appbar">
      {back ? (
        <button
          className="back"
          aria-label="חזרה"
          onClick={() => (typeof back === 'string' ? router.push(back) : router.back())}
        >
          →
        </button>
      ) : null}
      <h1>{title}</h1>
      {right}
    </div>
  );
}
