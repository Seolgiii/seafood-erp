"use client";

interface Props {
  /** 세션 만료까지 남은 ms (음수면 이미 만료) */
  remainingMs: number;
  /** "로그인 연장" 버튼 클릭 시 호출 */
  onExtend: () => void;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}초`;
  return `${min}분 ${sec.toString().padStart(2, "0")}초`;
}

export default function SessionExpiryBanner({ remainingMs, onExtend }: Props) {
  const isCritical = remainingMs < 60 * 1000; // 1분 이하 강조

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[100] ${
        isCritical ? "bg-red-600" : "bg-amber-500"
      } text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg`}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <span className="text-[14px] font-bold leading-tight min-w-0 truncate">
        세션이 {formatRemaining(remainingMs)} 후 만료됩니다
      </span>
      <button
        type="button"
        onClick={onExtend}
        className="shrink-0 bg-white text-gray-900 font-bold text-[14px] px-4 py-2 rounded-xl active:scale-95 transition-transform"
      >
        로그인 연장
      </button>
    </div>
  );
}
