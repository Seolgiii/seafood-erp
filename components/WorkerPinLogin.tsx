"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSessionExpired, readSession, writeSession } from "@/lib/session";

type Worker = { id: string; name: string };

const AVATAR_COLORS = [
  "#3182F6", "#FF3B30", "#FF8C00", "#00D082", "#5061FF",
  "#8B95A1", "#FF6B6B", "#4ECDC4", "#A78BFA", "#F59E0B",
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

/**
 * callbackUrl 안전성 검증.
 * - 절대 path("/...")만 허용 — 외부 도메인 / protocol-relative URL 차단 (open redirect 방지)
 * - decodeURIComponent 실패 시 null 반환
 */
function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  return decoded;
}

export function WorkerPinLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeWorker, setActiveWorker] = useState<Worker | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeWorkerRef = useRef<Worker | null>(null);

  const [pin, setPin] = useState("");
  const [errorFlash, setErrorFlash] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => { activeWorkerRef.current = activeWorker; }, [activeWorker]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  // 이미 로그인된 상태에서 /login 진입 시 — callbackUrl 있으면 그곳으로, 없으면 메인으로
  useEffect(() => {
    const s = readSession();
    if (s && !isSessionExpired(s)) {
      const target = safeCallbackUrl(searchParams.get("callbackUrl")) ?? "/";
      router.replace(target);
    }
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workers");
        const data = (await res.json()) as { workers?: Worker[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "목록을 불러오지 못했습니다");
        if (!cancelled) setWorkers(data.workers ?? []);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => {
      setSheetMounted(false);
      setActiveWorker(null);
      setPin("");
      setAuthError(null);
      setErrorFlash(false);
      setSubmitting(false);
      submittingRef.current = false;
    }, 320);
  }, []);

  const triggerError = useCallback((msg: string) => {
    setAuthError(msg);
    setPin("");
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 480);
  }, []);

  const submitPin = useCallback(async (worker: Worker, code: string) => {
    submittingRef.current = true;
    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: worker.id, pin: code }),
      });
      const data = (await res.json()) as {
        worker?: { id: string; name: string; role?: string };
        error?: string;
      };
      if (!res.ok) {
        triggerError(data.error ?? "PIN이 올바르지 않습니다");
        return;
      }
      if (data.worker) {
        writeSession({
          workerId: data.worker.id,
          workerName: data.worker.name,
          role: data.worker.role ?? "WORKER",
          lastActivityAt: Date.now(),
        });
        const target = safeCallbackUrl(searchParams.get("callbackUrl")) ?? "/";
        router.push(target);
      }
    } catch {
      triggerError("연결에 실패했습니다");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [router, searchParams, triggerError]);

  const appendDigit = useCallback((d: string) => {
    setPin((p) => {
      if (p.length >= 4 || submittingRef.current) return p;
      const next = p + d;
      setAuthError(null);
      const w = activeWorkerRef.current;
      if (next.length === 4 && w) void submitPin(w, next);
      return next;
    });
  }, [submitPin]);

  const backspace = useCallback(() => {
    if (submittingRef.current) return;
    setPin((p) => p.slice(0, -1));
    setAuthError(null);
  }, []);

  const openForWorker = (w: Worker, index: number) => {
    setActiveWorker(w);
    setActiveIndex(index);
    setPin("");
    setAuthError(null);
    setErrorFlash(false);
    setSheetMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSheetVisible(true));
    });
  };

  const dotBg = (i: number) => {
    if (errorFlash) return "#FF3B30";
    if (i < pin.length) return "#191F28";
    return "#E5E8EB";
  };

  return (
    <main
      className="flex min-h-screen flex-col bg-[#F2F4F6]"
      style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
    >
      {/* 블루 헤더 */}
      <header
        className="bg-[#3182F6] px-6 pt-12 pb-10 flex-shrink-0 relative overflow-hidden flex flex-col items-end justify-end"
        style={{ minHeight: 210 }}
      >
        {/* 헤더 내부 잔잔한 웨이브 */}
        <svg
          className="absolute left-0 right-0 pointer-events-none"
          style={{ bottom: 14, width: "100%", height: 22 }}
          viewBox="0 0 320 22"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,11 C60,3 120,18 180,11 C240,4 320,13 320,13 L320,22 L0,22 Z"
            fill="white"
            fillOpacity="0.13"
          />
        </svg>
        {/* 화이트 컨텐츠로 이어지는 웨이브 컷 */}
        <svg
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{ width: "100%", height: 16 }}
          viewBox="0 0 320 16"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,9 C80,0 160,16 240,7 C280,3 320,9 320,9 L320,16 L0,16 Z"
            fill="#F2F4F6"
          />
        </svg>
        <h1
          className="text-white font-black tracking-tight leading-none relative"
          style={{ fontSize: 40, letterSpacing: "-1.5px" }}
        >
          SEAERP
        </h1>
        <p className="mt-2 text-[13px] font-medium text-blue-100 relative">작업자를 선택해 로그인하세요</p>
      </header>

      {/* 작업자 목록 */}
      <div className="flex-1 px-4 pt-4">
        {loadingList && (
          <div className="flex justify-center pt-24">
            <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#3182F6] rounded-full animate-spin" />
          </div>
        )}
        {loadError && (
          <p className="text-center text-[15px] text-red-500 pt-24">{loadError}</p>
        )}
        {!loadingList && !loadError && (
          <ul className="flex flex-col gap-2.5">
            {workers.length === 0 ? (
              <li className="text-center text-[15px] text-gray-400 pt-24">등록된 작업자가 없습니다</li>
            ) : (
              workers.map((w, i) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => openForWorker(w, i)}
                    className="w-full bg-white flex items-center gap-3.5 px-4 py-3.5 rounded-2xl shadow-sm active:scale-[0.98] transition-transform touch-manipulation"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-black shrink-0"
                      style={{ backgroundColor: avatarColor(i) }}
                    >
                      {w.name[0]}
                    </div>
                    <span className="text-[15px] font-bold text-[#191F28]">{w.name}</span>
                    <svg className="ml-auto w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* 바텀시트 */}
      {sheetMounted && (
        <>
          {/* 딤드 배경 */}
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
            style={{ opacity: sheetVisible ? 1 : 0 }}
            onClick={closeSheet}
          />

          {/* 시트 본체 */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.10)] transition-transform duration-300 ease-out"
            style={{ transform: sheetVisible ? "translateY(0)" : "translateY(100%)" }}
          >
            {/* 핸들 바 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-[5px] rounded-full bg-gray-200" />
            </div>

            {/* 아바타 */}
            <div className="flex justify-center pt-6 pb-1">
              <div
                className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-[20px] font-black"
                style={{ backgroundColor: avatarColor(activeIndex) }}
              >
                {activeWorker?.name[0]}
              </div>
            </div>

            {/* PIN 점 */}
            <div className="flex justify-center gap-[18px] py-7">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[13px] h-[13px] rounded-full transition-all duration-150"
                  style={{ backgroundColor: dotBg(i) }}
                />
              ))}
            </div>

            {/* 오류 메시지 (점 아래) */}
            <div className="h-5 flex items-center justify-center -mt-3 mb-1">
              {authError && (
                <p className="text-[13px] font-bold text-red-500">{authError}</p>
              )}
            </div>

            {/* 키패드 */}
            <div
              className="grid grid-cols-3 px-6 pb-2"
              style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
            >
              {(["1","2","3","4","5","6","7","8","9"] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={submitting}
                  onClick={() => appendDigit(n)}
                  className="flex items-center justify-center h-[68px] text-[26px] font-semibold text-[#191F28] rounded-2xl active:bg-gray-100 transition-colors disabled:opacity-30 touch-manipulation"
                >
                  {n}
                </button>
              ))}
              {/* C — 전체 지우기 */}
              <button
                type="button"
                disabled={submitting}
                onClick={() => { setPin(""); setAuthError(null); }}
                className="flex items-center justify-center h-[68px] text-[26px] font-semibold text-[#191F28] rounded-2xl active:bg-gray-100 transition-colors disabled:opacity-30 touch-manipulation"
              >
                C
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => appendDigit("0")}
                className="flex items-center justify-center h-[68px] text-[26px] font-semibold text-[#191F28] rounded-2xl active:bg-gray-100 transition-colors disabled:opacity-30 touch-manipulation"
              >
                0
              </button>
              {/* 백스페이스 */}
              <button
                type="button"
                disabled={submitting}
                onClick={backspace}
                aria-label="한 자리 지우기"
                className="flex items-center justify-center h-[68px] rounded-2xl active:bg-gray-100 transition-colors disabled:opacity-30 touch-manipulation"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#191F28"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 12H5" />
                  <path d="M12 19L5 12L12 5" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
