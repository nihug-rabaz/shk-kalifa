import type { Metadata } from 'next';
import './globals.css';
import { BoardTitle } from './BoardTitle';
import { ServiceWorkerManager } from './ServiceWorkerManager';

export const metadata: Metadata = {
  title: 'מפקדת הרבנות הצבאית',
  description: 'מערכת שיוך לוחות',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="ltr">
      <body>
        <ServiceWorkerManager />
        <BoardTitle />
        {children}
      </body>
    </html>
  );
}

