"use client";

import { useEffect } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { logError } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("[GlobalError]", error.message, error.digest, error.stack);
  }, [error]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center bg-[#F2F4F6] px-6"
      style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
    >
      <div className="w-full max-w-sm bg-white rounded-[24px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] p-7 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <ExclamationTriangleIcon className="w-8 h-8 text-[#FF3B30]" />
        </div>
        <div>
          <h1 className="text-[18px] font-black text-gray-900 tracking-tight">
            화면을 표시할 수 없습니다
          </h1>
          <p className="text-[13px] text-gray-500 font-medium mt-1.5 leading-snug">
            일시적인 오류가 발생했어요.
            <br />
            다시 시도하거나 메인으로 돌아가 주세요.
          </p>
        </div>
        {error.digest && (
          <p className="text-[11px] text-gray-400 font-mono">에러 ID: {error.digest}</p>
        )}
        <div className="w-full flex flex-col gap-2 mt-1">
          <button
            type="button"
            onClick={reset}
            className="w-full py-3.5 rounded-2xl bg-[#3182F6] text-white text-[15px] font-black active:scale-[0.98] transition-transform shadow-[0_4px_16px_rgba(49,130,246,0.3)]"
          >
            다시 시도
          </button>
          {/* 에러 바운더리 복구를 위해 풀 리로드를 의도적으로 사용 (Link 사용 시 라우터 상태가 깨진 채로 남을 수 있음) */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 text-[14px] font-bold text-center active:scale-[0.98] transition-transform"
          >
            메인으로 돌아가기
          </a>
        </div>
      </div>
    </main>
  );
}
