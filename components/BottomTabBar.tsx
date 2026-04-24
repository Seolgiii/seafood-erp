"use client";

export type BottomTab<K extends string = string> = {
  key: K;
  label: string;
};

type BottomTabBarProps<K extends string> = {
  tabs: BottomTab<K>[];
  activeKey: K;
  onChange: (key: K) => void;
};

/**
 * 토스 스타일 하단 탭바.
 * 선택된 탭은 파란 pill(#3B82F6) 배경 + 흰 글자로 강조되며,
 * activeKey 변화 시 pill이 탭 사이를 슬라이드 이동(CSS transition).
 * framer-motion 등 외부 애니메이션 라이브러리 미사용.
 *
 * 본문 컨테이너는 하단 탭바 높이만큼 padding-bottom이 필요하다:
 *   style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom))" }}
 */
export default function BottomTabBar<K extends string>({
  tabs,
  activeKey,
  onChange,
}: BottomTabBarProps<K>) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );
  const tabCount = tabs.length;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 탭"
    >
      <div className="relative flex items-center p-1.5">
        {/* 슬라이딩 pill — 활성 탭의 영역 안으로 부드럽게 이동 */}
        <div
          className="absolute top-1.5 bottom-1.5 bg-[#3B82F6] rounded-full transition-all duration-300 ease-in-out"
          style={{
            width: `calc((100% - 12px) / ${tabCount})`,
            left: `calc(6px + ${activeIndex} * ((100% - 12px) / ${tabCount}))`,
          }}
          aria-hidden="true"
        />
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className="relative z-10 flex-1 py-2.5 active:scale-[0.92] transition-transform"
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`text-[13px] font-bold tracking-tight transition-colors duration-300 ${
                  active ? "text-white" : "text-gray-500"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
