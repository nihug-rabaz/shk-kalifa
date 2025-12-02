import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'שיוך לוח - Shchakim',
  description: 'מערכת שיוך לוחות',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="ltr">
      <body>{children}</body>
    </html>
  );
}

