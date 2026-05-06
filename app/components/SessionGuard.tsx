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
import SessionExpiryBanner from './SessionExpiryBanner';

// 세션 검사 없이 누구나 접근 가능한 경로
const PUBLIC_PATHS = ['/login'];

const CHECK_INTERVAL_MS = 30_000;        // 30초마다 만료 여부 확인
const WARN_THRESHOLD_MS = 5 * 60 * 1000; // 5분 이하 남으면 배너 노출
const COUNTDOWN_INTERVAL_MS = 1_000;     // 배너 표시 중 1초 단위로 카운트다운 갱신

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    // 공개 경로(로그인 페이지)는 세션 검사 없이 바로 렌더링
    if (isPublic) {
      setReady(true);
      setRemainingMs(null);
      return;
    }

    // ── 초기 세션 유효성 검사 ─────────────────────────────────────────
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      clearSession();
      // 현재 URL을 callbackUrl로 보존해 로그인 후 원래 페이지로 돌아올 수 있게 합니다.
      const callbackUrl = window.location.pathname + window.location.search;
      const target = callbackUrl === '/' || callbackUrl === ''
        ? '/login'
        : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
      router.replace(target);
      return;
    }

    // 세션 갱신 후 콘텐츠 표시
    touchSession();
    setReady(true);

    // ── 잔여시간 측정 + 배너 트리거 ────────────────────────────────────
    const computeRemaining = (): number | null => {
      const s = readSession();
      if (!s || isSessionExpired(s)) return null;
      return SESSION_IDLE_MS - (Date.now() - s.lastActivityAt);
    };

    // 30초 주기 만료 체크 (배너 노출 임계값 진입 시 카운트다운 시작용으로도 사용)
    const checkInterval = setInterval(() => {
      const s = readSession();
      if (!s || isSessionExpired(s)) {
        clearSession();
        router.replace('/login');
        return;
      }
      const remaining = computeRemaining();
      if (remaining != null && remaining <= WARN_THRESHOLD_MS) {
        setRemainingMs(remaining);
      } else {
        setRemainingMs(null);
      }
    }, CHECK_INTERVAL_MS);

    // 배너가 보이는 동안만 1초 단위로 카운트다운 갱신 (별도 interval)
    const countdownInterval = setInterval(() => {
      const remaining = computeRemaining();
      if (remaining == null) return;
      if (remaining <= WARN_THRESHOLD_MS) {
        setRemainingMs(remaining);
      } else if (remaining > WARN_THRESHOLD_MS) {
        // 임계값 위로 회복(연장 버튼 클릭 등)되면 배너 숨김
        setRemainingMs((prev) => (prev != null ? null : prev));
      }
    }, COUNTDOWN_INTERVAL_MS);

    // ── 사용자 활동 감지 → lastActivityAt 갱신 ───────────────────────
    // 클릭/터치/키 입력 시 세션 연장. 배너 노출 중에는 사용자가 활동만 해도 자동 연장됨.
    const onActivity = () => {
      touchSession();
    };

    const EVENTS = ['click', 'touchstart', 'keydown', 'scroll'] as const;
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      clearInterval(checkInterval);
      clearInterval(countdownInterval);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [pathname, isPublic, router]);

  const handleExtend = () => {
    touchSession();
    setRemainingMs(null);
  };

  // 세션 검사 완료 전에는 아무것도 렌더링하지 않음 (보호 콘텐츠 노출 방지)
  if (!ready) return null;

  return (
    <>
      {remainingMs != null && remainingMs > 0 && (
        <SessionExpiryBanner
          remainingMs={remainingMs}
          onExtend={handleExtend}
        />
      )}
      {children}
    </>
  );
}
