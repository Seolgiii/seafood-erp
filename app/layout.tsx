import type { Metadata } from 'next';
import './globals.css';

// 브라우저 탭에 표시될 기본 정보
export const metadata: Metadata = {
  title: '수산물 현장 ERP',
  description: 'LOT별 재고 및 출고/지출 관리 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}