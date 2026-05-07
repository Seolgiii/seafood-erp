# vitest_도입

## 상태
✅ 확정

## 한 줄 요약
테스트 프레임워크는 vitest (Jest 대비 가벼움 + ESM 지원 좋음)

## 결정 내용
5/4 첫 도입. 단위 5 files / 103 pass + 통합 12 files / 45 pass (21 시나리오). Airtable in-memory store + fetch 모킹 + 외부(Resend/Blob/PDF/next-cache) mock. npm scripts: test / test:integration / test:all.

## 영향받는 모듈
(메타·테스트 인프라 결정 — 직접 매핑되는 모듈 없음)

## 영향받는 시나리오
(직접 매핑되는 시나리오 없음 — 메타·테스트 인프라 결정)
