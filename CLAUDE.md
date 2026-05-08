[수산물 ERP 프로젝트 현황 — 2026년 5월 6일]

기술 스택: Next.js 15 + Airtable + Vercel + zod + Vitest + Resend
개발 방식: 1인 기획/개발 + Claude Code

■ 최근 변경 (2026-05-08)
- `/wrap-up` vault 경로 환경 독립화 — `git rev-parse --show-toplevel` 기반(mac/Windows 양쪽 동작)
- `/wrap-up` 4.5-D 단계 신설 — 60_관계도/ 자동 갱신 (4.5-D-1 큰그림 create-if-missing + 4.5-D-2 시나리오_플로우/A1~A5 sequenceDiagram 자동 생성)
- 큰 그림에 `조회 → 출고/이동` edge + 인프라 subgraph에 Airtable cylinder 추가

■ 핵심 도메인 흐름
- 입고: 신청 → 승인 대기 → 관리자 승인 → LOT별 재고 생성/반영 + 보관처 비용 적용 + 입고증 PDF
- 출고: LOT 검색 → 다건 신청 → 승인 → 입고관리.잔여수량 + LOT.재고수량 차감 + 출고시점 비용 7필드 스냅샷 + 출고증 PDF
- 재고 이동: LOT 이동 신청 → 승인 → 새 입고관리/LOT 자동 생성 (보관처 변경) + 원본 LOT 차감
- 지출결의: 신청 → 승인 → 지출결의서 PDF (100만원 기준 ADMIN/MASTER 권한 분리)
- 결재 양방향: 승인 ↔ 반려 토글 시 재고 자동 복구 (soft delete — LOT 보존 + 재고수량=0)

■ 보안
- 서버 액션 권한 재검증 (requireWorker / requireAdmin) — Airtable에서 role 직접 조회
- ADMIN_SECRET 강제 (관리 API), 디버그 API production 차단
- 100만원 권한 서버 재검증 (클라이언트 우회 차단, MASTER만 즉시 승인)
- POST 라우트 idempotency (X-Idempotency-Key + 5분 메모리 dedup)
- 출고 승인 멱등 가드 (출고시점 판매원가 > 0 시 중복 차감 차단)
- PIN: scrypt 해시화 + 자동 점진 마이그레이션 (평문 PIN 매칭 시 즉시 해시 PATCH)
- PIN rate limit Airtable 영속화 (5회→5분, 다시 5회→30분, 분산 환경 정확)
- 입력 sanitize (제어문자 제거 + 필드별 길이 제한)

■ 데이터 정합성
- 입고 반려: LOT 재고수량=0 + 보관처 비용 3필드 null (soft delete)
- 출고 반려: 잔여수량/LOT재고 +outQty 복구 + 출고시점 비용 7필드 null
- 재승인 시 자동 복원 (createLotOnInboundApproval 재실행)
- LOT 일련번호 동시성: 낙관적 재시도 (~99% 보호, 검증~POST 사이 race window 잔여)
- TRANSFER 반려 자동 복구는 미구현 — [INTEGRITY-ALERT] 로그 + 수동 보정
- Airtable 응답 zod 스키마 검증 (모니터링 모드, [SCHEMA-MISMATCH] 로그)
- 모든 정합성 위험 지점에 [INTEGRITY-ALERT] prefix 로그

■ UI / UX
- 메인: Hero 카드(입고/출고/재고조회) + KPI 스트립(오늘 입고/출고 + 결재 대기 2카드)
- 공통: PageHeader(얇은 헤더) / BottomTabBar(floating pill, 슬라이딩 액티브)
- 알림: lib/toast.ts (success/info/error 색 구분, slide-up 애니메이션)
  - 폼 검증 실패: 인라인 에러 + toast 보조
  - 일시적 알림: toast
  - 사용자 결정 필요: 디자인된 모달 (RejectBottomSheet 등)
- 자동 로그아웃: 5분 전 상단 배너 + "로그인 연장" 버튼 (1분 이하 시 빨간 강조)
- 검색 필터 URL 쿼리 동기화 (재고 조회/신청 내역/결재 수신함, 디바운스 300ms)
- 결재 수신함 완료 탭: 카드 클릭 → 액션 시트로 승인 ↔ 반려 양방향 변경
- 로그인: 블루 헤더 + 추상 웨이브 + 카드형 작업자 목록 + iOS status bar 색(#3182F6)
- PWA: manifest + theme-color + ServiceWorker + apple-touch-icon

■ 운영
- Vercel 배포 (자동 빌드)
- 일일 정산 이메일 cron — 매일 09:00 KST (vercel.json)
  - 어제(입고일/출고일/이동일/지출일 기준) 승인된 건 상세 표
  - 손익 추정 (출고 판매가 합 - 입고 수매가 합 - 지출 합)
  - 결재 대기 분리 (어제 신청 / 그 외 누적) + 24h 미처리 강조
  - A4 인쇄 친화 CSS, /api/preview/daily-report (dev 전용 프리뷰)
- 운영 로거 (lib/logger.ts) — production console 노출 차단
- 운영 알림: [INTEGRITY-ALERT] / [SCHEMA-MISMATCH] prefix로 grep 추적

■ Airtable 테이블 구조
운영 7개: 작업자 / 품목마스터 / LOT별 재고 / 입고 관리 / 출고 관리 / 지출결의 / 재고 이동
마스터 4개: 보관처 마스터 / 매입처 마스터 / 보관처 비용 이력 / 선박 정보 마스터(예정)

작업자 테이블 PIN 보안 필드 (5월 추가):
- pin_hash (Long text — "scrypt:saltHex:hashHex" 형식)
- pin_fail_count (Number)
- pin_locked_until (Number — Unix ms)

■ LOT번호 형식
YYMMDD-품목코드-규격-미수-전체일련번호
예) 260417-MC1-11-26-0001
영업일 오전 9시 기준, 전체 일련번호 (낙관적 재시도로 동시성 보호)

■ 테스트
- 단위 5 files / 103 pass: cost-calc / input-sanitize / number-format / pin-rate-limit-core / server-auth
- 통합 12 files / 45 pass — 21개 시나리오:
  - 골든패스 4 (입고/출고/이동/지출)
  - 정합성 5 (입고 반려·재승인, 출고 반려, LOT 동시성, 출고 멱등)
  - 권한·보안·검증·추가 12 (100만원 권한 / 비활성·PIN·위조 / 음수·재고초과·zod / Idempotency·양방향·PDF격리)
- npm scripts: test / test:integration / test:all
- Airtable in-memory store + fetch 모킹 + 외부(Resend/Blob/PDF/next-cache) mock

■ 환경변수
필수:
- AIRTABLE_API_KEY (PAT)
- AIRTABLE_BASE_ID
- ADMIN_SECRET (관리 API 인증)

운영 권장:
- CRON_SECRET (Vercel cron 인증)
- ALERT_EMAIL_TO, RESEND_API_KEY, ALERT_THRESHOLD (일일 보고)
- ALERT_EMAIL_FROM (기본 onboarding@resend.dev)
- NEXT_PUBLIC_BASE_URL (메일 내 대시보드 링크)

선택:
- AIRTABLE_*_TABLE (테이블명 override)
- AIRTABLE_TXN_TABLE (입출고 내역 별도 테이블)
- AIRTABLE_LOT_TO_INBOUND_FIELD (기본 "입고관리링크")

■ 현재 진행 중 (4월 메모 — 사용자 확인 필요)
- 갈치 품목코드 확정 (16건 LOT번호 미생성)
- 기존 재고 200건 비용 일괄 업데이트 (4/27 보관처 Link 통일로 일부 해결됐을 수 있음)
- 품목마스터 데이터 입력

■ 중기 목표
- 매입처/매입자/선박명 입고 폼 추가 — 부분 완료 (필드 도입됨)
- PDF 한글 폰트 임베드 — 완료 (scripts/generate-font-base64.mjs)
- PWA — 부분 완료 (manifest/theme-color/SW/iOS status bar)
- 기기별 고정 로그인 — 미진행
- 팩스 자동 발송 — 미진행
- 인라인 폼 에러 메시지화 — 부분 완료 (toast 통일까지, 인라인 정교화는 추후)

■ 장기 목표
- PostgreSQL DB 이전
- AI 데이터 분석
- 바코드 스캔 출고 (QR 스캔 도입됨, 바코드는 별도)
- 부자재 재고 확장 (포장지·아이스팩 등)
- TRANSFER 반려 자동 복구 (현재 수동 보정)
- 검색 결과 자동 트리거 (URL 복원 시 검색 자동 실행 옵션)
- LOT 일련번호 100% 동시성 (Airtable 자동번호 또는 Vercel KV 분산락)
- FIFO 평단가 시스템

■ 개발 원칙
- 잘 작동하는 기능은 건드리지 않음
- 최소 수정 원칙
- 데이터 정합성 우선
- Airtable 필드명 항상 실제 기준으로 확인
- 검증 실패 시 모니터링 모드 우선 (운영 회귀 위험 0)
- 보안 변경은 backward compatible 우선 (예: 평문 PIN → 해시 자동 마이그레이션)
- 정합성 위험 지점은 [INTEGRITY-ALERT] / [SCHEMA-MISMATCH] prefix로 로깅
- alert 대신 toast / 인라인 / 모달로 메시지 무게에 맞게 분리

■ 주요 디렉터리
- app/actions/ — server action (admin/inventory/expense/my-requests/dashboard)
- app/api/ — REST API 라우트 (cron/preview/auth/admin/etc.)
- app/admin/ — 관리자 대시보드 / 결재 수신함
- app/inventory/ — 재고 조회 / 입고 / 출고 / 이동
- app/expense/ — 지출 신청 / 목록
- app/my-requests/ — 신청 내역
- components/ — 폼/모달 (InboundForm, OutboundQtyModal, ApprovalButtons 등)
- app/components/ — 페이지 전용 (SessionGuard, RejectBottomSheet, CompletedItemActionSheet)
- lib/ — 도메인 로직
  - airtable.ts / airtable-schema.ts — Airtable 어댑터
  - server-auth.ts — 권한 검증
  - pin-hash.ts / pin-rate-limit.ts (Airtable 어댑터) / pin-rate-limit-core.ts (순수 로직)
  - approval-service.ts — 결재 처리
  - lot-sequence.ts — LOT 일련번호 동시성
  - idempotency.ts — POST dedup
  - daily-report.ts / resend.ts — 일일 정산
  - storage-cost.ts — 보관처 비용 이력
  - cost-calc.ts — 출고 시점 비용·손익 계산
  - input-sanitize.ts / number-format.ts / spec-display.ts — 입력 정규화
  - logger.ts — 운영 로거
  - schemas/ — zod 스키마 (worker/product/lot/inbound/outbound/expense/storage/supplier/transfer)
- test/integration/ — 통합 테스트 21개 시나리오
