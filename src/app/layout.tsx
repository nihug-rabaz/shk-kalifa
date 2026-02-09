import type { Metadata } from 'next';
import './globals.css';
import { BoardTitle } from './BoardTitle';

export const metadata: Metadata = {
  title: 'מפקדת הרבנות הצבאית',
  description: 'מערכת שיוך לוחות',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="ltr">
      <body>
        <BoardTitle />
        {children}
      </body>
    </html>
  );
}

