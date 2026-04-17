"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearSession,
  isSessionExpired,
  readSession,
  touchSession,
  SESSION_IDLE_MS,
} from "@/lib/session";

type Props = { children: React.ReactNode };

export function SearchShell({ children }: Props) {
  const router = useRouter();
  const lastTouchRef = useRef(0);

  const enforceSession = useCallback(() => {
    const s = readSession();
    if (!s || isSessionExpired(s)) {
      clearSession();
      router.replace("/login");
      return false;
    }
    return true;
  }, [router]);

  useEffect(() => {
    if (!enforceSession()) return;

    const THROTTLE_MS = 2000;
    const bump = () => {
      const now = Date.now();
      if (now - lastTouchRef.current < THROTTLE_MS) return;
      lastTouchRef.current = now;
      const s = readSession();
      if (!s || isSessionExpired(s)) {
        clearSession();
        router.replace("/login");
        return;
      }
      touchSession();
    };

    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

    const tick = window.setInterval(() => {
      const s = readSession();
      if (!s || isSessionExpired(s)) {
        clearSession();
        router.replace("/login");
      }
    }, Math.min(SESSION_IDLE_MS / 2, 60_000));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      window.clearInterval(tick);
    };
  }, [enforceSession, router]);

  return <>{children}</>;
}
