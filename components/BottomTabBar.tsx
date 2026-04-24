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
 * 화면 하단에 fixed 되는 탭바. iOS safe-area-inset-bottom 자동 적용.
 * 본문 컨테이너는 하단 탭바 높이만큼 padding-bottom을 둬야 콘텐츠가 가려지지 않는다.
 *   style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}
 */
export default function BottomTabBar<K extends string>({
  tabs,
  activeKey,
  onChange,
}: BottomTabBarProps<K>) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 flex shadow-[0_-1px_0_0_rgba(0,0,0,0.03)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 탭"
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-1 py-3 flex items-center justify-center transition-colors ${
              active ? "text-[#3182F6]" : "text-gray-400"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className={`text-[13px] tracking-tight ${active ? "font-black" : "font-bold"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
