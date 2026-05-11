"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Accent = "blue" | "red" | "orange" | "green";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 확인 버튼 색. destructive 액션은 red 권장. */
  accent?: Accent;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const ACCENT_BG: Record<Accent, string> = {
  blue: "bg-[#3182F6]",
  red: "bg-[#FF3B30]",
  orange: "bg-[#FF8C00]",
  green: "bg-[#00D082]",
};

/**
 * window.confirm 대체 — Promise 기반 BottomSheet 모달.
 *
 * 사용 예:
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: "신청을 취소할까요?", accent: "red" })) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ opts, resolve });
    });
  }, []);

  const handle = (val: boolean) => {
    if (state) state.resolve(val);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && <ConfirmDialog opts={state.opts} onResult={handle} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

function ConfirmDialog({
  opts,
  onResult,
}: {
  opts: ConfirmOptions;
  onResult: (val: boolean) => void;
}) {
  const accent = opts.accent ?? "blue";
  const confirmLabel = opts.confirmLabel ?? "확인";
  const cancelLabel = opts.cancelLabel ?? "닫기";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={() => onResult(false)}
      />
      <div className="relative bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-7 pb-10 sm:pb-7 shadow-2xl animate-slide-up">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-7 sm:hidden" />

        <h3 className="text-[20px] font-bold text-gray-900 leading-snug">
          {opts.title}
        </h3>
        {opts.message && (
          <p className="text-gray-500 font-medium mt-2 text-[14px] leading-relaxed">
            {opts.message}
          </p>
        )}

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="flex-1 bg-gray-100 text-gray-600 font-bold text-[16px] py-4 rounded-2xl active:scale-95 transition-transform"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResult(true)}
            className={`flex-[2] text-white font-bold text-[16px] py-4 rounded-2xl active:scale-95 transition-transform shadow-lg ${ACCENT_BG[accent]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
