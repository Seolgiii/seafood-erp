"use client";

import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
  titleClassName?: string;
};

/**
 * 공통 페이지 헤더 — 토스 스타일 얇은 헤더(h-12).
 * 뒤로가기 버튼 + 제목(부제) + 우측 슬롯 구조로 모든 하위 페이지에서 통일 사용.
 */
export default function PageHeader({
  title,
  subtitle,
  onBack,
  rightSlot,
  titleClassName = "",
}: PageHeaderProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  return (
    <header className="sticky top-0 z-20 bg-white h-12 flex items-center gap-1 px-3 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
      <button
        onClick={handleBack}
        className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-gray-100 transition-colors"
        aria-label="뒤로 가기"
      >
        <ChevronLeftIcon className="w-5 h-5 text-gray-800" />
      </button>
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <h1 className={`text-[16px] font-bold tracking-tight truncate text-gray-900 ${titleClassName}`}>
          {title}
        </h1>
        {subtitle && (
          <span className="text-[12px] font-medium text-gray-400 truncate">
            {subtitle}
          </span>
        )}
      </div>
      {rightSlot && <div className="shrink-0 flex items-center gap-2">{rightSlot}</div>}
    </header>
  );
}
