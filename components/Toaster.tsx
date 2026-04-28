'use client';

import { useEffect, useState } from 'react';

type ToastItem = { id: number; message: string; type: 'success' | 'error' | 'info' };

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type: ToastItem['type'] }>).detail;
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
    window.addEventListener('sea-toast', handler);
    return () => window.removeEventListener('sea-toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-5 py-4 rounded-2xl text-white text-[15px] font-bold shadow-2xl animate-slide-up ${
            t.type === 'success' ? 'bg-[#00C471]' :
            t.type === 'info'    ? 'bg-[#3182F6]' :
                                   'bg-[#191F28]'
          }`}
          style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
