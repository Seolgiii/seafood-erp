"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 컴포넌트 state를 URL 쿼리스트링에 디바운스 동기화합니다.
 *
 * - 빈 문자열 / null / undefined 는 URL에 포함하지 않음 (지저분 방지)
 * - `router.replace` 사용 → 매 변경마다 history 누적 X (뒤로가기 정상)
 * - 페이지 초기값은 호출자가 `useSearchParams().get(key)` 로 읽어 state에 주입
 *
 * @param values  동기화할 key → value 객체 (key 순서·이름이 그대로 URL에 반영)
 * @param debounceMs 디바운스 밀리초 (기본 300, 텍스트 입력은 300, 버튼·셀렉트는 0 권장)
 */
export function useSyncQueryParams(
  values: Record<string, string | number | null | undefined>,
  debounceMs = 300,
): void {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 첫 렌더에서 URL 갱신을 막아 SSR/CSR 불일치를 피함
  const mountedRef = useRef(false);

  // values를 안정 비교용 직렬화 (참조 변경 무관)
  const serialized = JSON.stringify(values);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      // 초기 마운트는 URL에 이미 들어있는 값과 일치해야 하므로 동기화 생략
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      const v = JSON.parse(serialized) as Record<
        string,
        string | number | null | undefined
      >;
      for (const [k, raw] of Object.entries(v)) {
        if (raw == null) continue;
        const s = typeof raw === "number" ? String(raw) : raw.trim();
        if (s) params.set(k, s);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [serialized, pathname, router, debounceMs]);
}
