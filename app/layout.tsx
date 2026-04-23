import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorker from './components/ServiceWorker';

export const metadata: Metadata = {
  title: 'SEAERP',
  description: '수산물 현장 ERP — LOT별 재고·입출고·지출 관리',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SEAERP',
  },
  formatDetection: { telephone: false },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3182F6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
