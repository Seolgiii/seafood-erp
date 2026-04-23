'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  clearSession,
  isSessionExpired,
  readSession,
  touchSession,
  SESSION_IDLE_MS,
} from '@/lib/session';

// 세션 검사 없이 누구나 접근 가능한 경로
const PUBLIC_PATHS = ['/login'];

const CHECK_INTERVAL_MS = 30_000; // 30초마다 만료 여부 확인

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const warnedRef = useRef(false); // 만료 경고 중복 방지

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    // 공개 경로(로그인 페이지)는 세션 검사 없이 바로 렌더링
    if (isPublic) {
      setReady(true);
      return;
    }

    // ── 초기 세션 유효성 검사 ─────────────────────────────────────────
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      clearSession();
      router.replace('/login');
      return; // setReady(false) 유지 → 보호 콘텐츠 깜빡임 없음
    }

    // 세션 갱신 후 콘텐츠 표시
    touchSession();
    setReady(true);
    warnedRef.current = false;

    // ── 30초마다 만료 여부 재확인 ─────────────────────────────────────
    const interval = setInterval(() => {
      const s = readSession();
      if (!s || isSessionExpired(s)) {
        clearSession();
        router.replace('/login');
        return;
      }

      // 만료 3분 전 경고 (선택적 UX)
      const remaining = SESSION_IDLE_MS - (Date.now() - s.lastActivityAt);
      if (remaining < 3 * 60 * 1000 && !warnedRef.current) {
        warnedRef.current = true;
        // 브라우저 알림 대신 콘솔 경고 (toast 컴포넌트 없음)
        console.warn('[SessionGuard] 세션 만료 3분 전');
      }
    }, CHECK_INTERVAL_MS);

    // ── 사용자 활동 감지 → lastActivityAt 갱신 ───────────────────────
    // 클릭/터치/키 입력 시 세션 연장
    const onActivity = () => {
      warnedRef.current = false;
      touchSession();
    };

    const EVENTS = ['click', 'touchstart', 'keydown', 'scroll'] as const;
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [pathname, isPublic, router]);

  // 세션 검사 완료 전에는 아무것도 렌더링하지 않음 (보호 콘텐츠 노출 방지)
  if (!ready) return null;

  return <>{children}</>;
}
