# ADMIN_SECRET_강제

## 상태
✅ 확정

## 한 줄 요약
관리 API 진입 시 ADMIN_SECRET 헤더 강제, 디버그 API는 production 차단

## 결정 내용
`/api/admin/*` 라우트는 ADMIN_SECRET 환경변수와 일치하지 않으면 401. `/api/debug/*`는 production에서 즉시 404. 5/6 Critical 4건 패치 중 하나.

## 영향받는 모듈
- [[서버_권한_검증]]
- [[관리자_대시보드]]

## 영향받는 시나리오
(직접 매핑되는 시나리오 없음 — 인프라/보안 결정)
