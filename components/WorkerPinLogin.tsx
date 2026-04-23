"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  isSessionExpired,
  readSession,
  writeSession,
} from "@/lib/session";

type Worker = { id: string; name: string };

const padClass =
  "flex min-h-[5.5rem] min-w-[5.5rem] items-center justify-center rounded-2xl border-2 border-slate-300 bg-white text-4xl font-semibold shadow-sm active:scale-[0.98] touch-manipulation hover:bg-slate-50 md:min-h-[6rem] md:min-w-[6rem] md:text-5xl";

const nameButtonClass =
  "flex w-full items-center justify-center rounded-2xl border border-blue-700 bg-blue-600 px-8 py-8 text-center text-[2.25rem] font-bold text-white shadow-md transition-transform duration-150 active:scale-[0.99] touch-manipulation hover:scale-105 hover:bg-blue-700 md:py-9 md:text-5xl";

export function WorkerPinLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeWorker, setActiveWorker] = useState<Worker | null>(null);
  const activeWorkerRef = useRef<Worker | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    activeWorkerRef.current = activeWorker;
  }, [activeWorker]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    const s = readSession();
    if (s && !isSessionExpired(s)) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workers");
        const data = (await res.json()) as {
          workers?: Worker[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "목록을 불러오지 못했습니다");
        }
        if (!cancelled) {
          setWorkers(data.workers ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "네트워크 오류");
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const closePad = useCallback(() => {
    submittingRef.current = false;
    setPickerOpen(false);
    setActiveWorker(null);
    setPin("");
    setAuthError(null);
    setSubmitting(false);
  }, []);

  const submitPin = useCallback(
    async (worker: Worker, code: string) => {
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
          setAuthError(data.error ?? "로그인 실패");
          setPin("");
          return;
        }
        if (data.worker) {
          writeSession({
            workerId: data.worker.id,
            workerName: data.worker.name,
            role: data.worker.role ?? "WORKER",
            lastActivityAt: Date.now(),
          });
          const callbackUrl = searchParams.get("callbackUrl");
          router.push(callbackUrl ? decodeURIComponent(callbackUrl) : "/");
        }
      } catch {
        setAuthError("연결에 실패했습니다");
        setPin("");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [router, searchParams]
  );

  const appendDigit = useCallback(
    (d: string) => {
      setPin((p) => {
        if (p.length >= 4 || submittingRef.current) return p;
        const next = p + d;
        setAuthError(null);
        const w = activeWorkerRef.current;
        if (next.length === 4 && w) {
          void submitPin(w, next);
        }
        return next;
      });
    },
    [submitPin]
  );

  const backspace = () => {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setAuthError(null);
  };

  const openForWorker = (w: Worker) => {
    setActiveWorker(w);
    setPin("");
    setAuthError(null);
    setPickerOpen(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 md:py-14">
      <section className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg md:p-10">
        <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
          작업자 로그인
        </h1>
        <p className="mt-5 text-2xl leading-relaxed text-slate-600 md:text-3xl">
          이름을 누른 뒤 PIN 4자리를 입력하세요
        </p>
      </div>

      {loadingList && (
        <p className="mt-10 text-center text-3xl text-slate-500">불러오는 중…</p>
      )}
      {loadError && (
        <p className="mx-auto mt-10 max-w-2xl text-center text-2xl text-red-600">
          {loadError}
        </p>
      )}

      {!loadingList && !loadError && (
        <ul className="mx-auto mt-10 flex w-full max-w-2xl flex-col items-center gap-5">
          {workers.length === 0 ? (
            <li className="text-2xl text-slate-500">등록된 작업자가 없습니다</li>
          ) : (
            workers.map((w) => (
              <li key={w.id} className="w-full">
                <button
                  type="button"
                  className={nameButtonClass}
                  onClick={() => openForWorker(w)}
                >
                  {w.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      </section>

      {pickerOpen && activeWorker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="PIN 입력"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-slate-100 p-6 shadow-2xl md:p-10">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-xl px-4 py-3 text-2xl font-medium text-slate-600 hover:bg-slate-200 md:text-3xl"
              onClick={closePad}
            >
              닫기
            </button>

            <h2 className="pr-20 text-3xl font-bold text-slate-900 md:text-4xl">
              {activeWorker.name}
            </h2>
            <p className="mt-2 text-2xl text-slate-600 md:text-3xl">
              4자리 PIN
            </p>

            <div
              className="mt-6 flex h-16 items-center justify-center gap-4 text-5xl font-mono text-slate-900 md:h-20 md:text-6xl"
              aria-live="polite"
            >
              {[0, 1, 2, 3].map((i) => (
                <span key={i}>{i < pin.length ? "●" : "○"}</span>
              ))}
            </div>

            {authError && (
              <p className="mt-4 text-center text-2xl text-red-600 md:text-3xl">
                {authError}
              </p>
            )}
            {submitting && (
              <p className="mt-4 text-center text-2xl text-slate-500">확인 중…</p>
            )}

            <div className="mt-8 grid grid-cols-3 gap-4 md:gap-5">
              {(["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).map(
                (n) => (
                  <button
                    key={n}
                    type="button"
                    className={padClass}
                    disabled={submitting}
                    onClick={() => appendDigit(n)}
                  >
                    {n}
                  </button>
                )
              )}
              <button
                type="button"
                className={`${padClass} border-amber-400 bg-amber-50`}
                disabled={submitting}
                onClick={() => {
                  setPin("");
                  setAuthError(null);
                }}
                aria-label="전체 클리어"
              >
                C
              </button>
              <button
                type="button"
                className={padClass}
                disabled={submitting}
                onClick={() => appendDigit("0")}
              >
                0
              </button>
              <button
                type="button"
                className={padClass}
                disabled={submitting}
                onClick={backspace}
                aria-label="지우기"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
