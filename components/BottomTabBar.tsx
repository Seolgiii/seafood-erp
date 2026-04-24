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
 * 토스 스타일 floating 하단 탭바.
 * 화면 바닥에서 떠있는 "섬"처럼 좌우·하단 16px margin + rounded-full + box-shadow.
 * 선택된 탭은 파란 pill(#3B82F6)이 탭 영역으로 슬라이드 이동(CSS transition).
 * framer-motion 등 외부 애니메이션 라이브러리 미사용.
 *
 * 본문 컨테이너는 탭바 높이(≈52px) + 하단 margin(16px) + 여유 공간만큼 padding-bottom 필요:
 *   style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}
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
      className="fixed left-4 right-4 z-30 bg-white rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
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
