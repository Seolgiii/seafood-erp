'use client';

import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('[SW] 등록 완료:', reg.scope))
        .catch((err) => console.error('[SW] 등록 실패:', err));
    }
  }, []);

  return null;
}
