import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);
  const active = useRef(false);
  const refreshing = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    let currentY = 0;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY !== 0 || refreshing.current) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (window.scrollY > 0) { active.current = false; return; }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { active.current = false; currentY = 0; setPullY(0); return; }
      if (e.cancelable) e.preventDefault();
      currentY = Math.min(delta * 0.5, THRESHOLD + 20);
      setPullY(currentY);
    };

    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      const y = currentY;
      currentY = 0;
      setPullY(0);
      if (y >= THRESHOLD && !refreshing.current) {
        refreshing.current = true;
        await onRefreshRef.current();
        refreshing.current = false;
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  return { pullY, isReady: pullY >= THRESHOLD };
}
