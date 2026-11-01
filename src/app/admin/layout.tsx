import type { Metadata } from 'next';
import './admin.css';

export const metadata: Metadata = {
  title: 'ניהול לוחות',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-root" dir="rtl">
      {children}
    </div>
  );
}
