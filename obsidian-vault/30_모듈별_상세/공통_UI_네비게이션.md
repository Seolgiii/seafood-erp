# 공통_UI_네비게이션

## 역할
토스 스타일 디자인 언어. PageHeader(얇은 헤더) / BottomTabBar(floating pill) / Toaster / 검색 필터 URL 쿼리 동기화

## 코드 위치
- components/PageHeader.tsx
- components/BottomTabBar.tsx
- components/Toaster.tsx
- components/SearchShell.tsx
- lib/toast.ts
- lib/use-sync-query-params.ts

## 현재 상태
운영 중

## 관련 결정사항
- [[토스스타일_UI_언어_통일]]
- [[BottomTabBar_floating_pill]]
- [[토스트_메시지_무게별_분리]]
- [[인라인_폼_에러_정교화]]

## 의존 모듈
(인프라 모듈 — 다른 모듈에 의존하지 않음)

## 등장하는 시나리오
- [[50_시나리오/A7_자동로그아웃_5분전_경고]]
- [[50_시나리오/B4_검색필터_URL_동기화]]
