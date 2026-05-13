# SEAERP 작업 일지

기간: 2026-04-24 ~ 2026-05-06 (14일, 활동 8일, 70개 커밋)

---

### 2026-04-24

**완료한 작업**
- 입고 폼 섹션화 + 품목구분 기반 원산지 조건부 노출
- 라우트 전환 시 홈 스켈레톤 플래시 제거 (`app/loading.tsx` 삭제)
- 메인 화면 Hero(4:3) + Secondary 그리드로 재구성
- 메뉴 아이콘 이모지 → Heroicons 통일 + SEAERP 로고 추가
- 메인 KPI 카드 신설 (오늘 입고/출고/결재 대기) → 이후 전용 스트립으로 분리
- 공통 컴포넌트 도입: `PageHeader`(토스 스타일 얇은 헤더), `BottomTabBar`(floating pill)
- 신청 내역/결재 수신함 탭을 상단 → 하단 고정 탭바로 이동
- 본문/입력 폰트 1~2px 축소, "지출결의" → "지출" 축약

**결정 사항**
- 디자인 언어를 토스 스타일로 통일 — 모바일 위주 사용성 + 일관된 컴포넌트 라이브러리
- BottomTabBar는 화면 떠 있는 floating pill 섬 형태 (시각적 분리감 + 키보드 영향 적음)

**미해결 이슈**
- 페이지마다 헤더 디자인이 제각각이었던 부분 정리 미완료 (다음 단계로)

**다음 작업 후보**
- 출고 검색 UX 정확도 개선
- 재고 이동(LOT 보관처 변경) 기능 신규
- 재고 조회 화면 흐름 재설계

---

### 2026-04-25

**완료한 작업**
- 출고 검색 정확도 + UX 개선 + 기존 재고 마이그레이션 사전 준비

**결정 사항**
- 출고 검색은 LOT번호 일련번호와 품목명만 매칭 (중간 토큰 우연 매칭 차단)

**미해결 이슈**
- 기존 재고(`비고="기존 재고"`)가 결재 흐름에 들어오면 안 되는 케이스

**다음 작업 후보**
- 보관처 Link 필드 통일 + 기존 재고 마이그레이션
- 재고 이동 도메인 신규

---

### 2026-04-27

**완료한 작업**
- 보관처 전 테이블 Link 필드 통일 + 기존 재고 마이그레이션
- 결재 수신함 2주 필터 + 기존 재고/이동 신청 제외 (이중 필터)
- 재고 이동 기능 신규 구현 (LOT을 다른 보관처로, 새 입고관리/LOT 자동 생성, 원본 차감)
- 재고 이동 승인 중복 생성 + 대시보드 버그 수정
- 검색 버튼 화면 이탈 수정 (`flex min-w-0 + shrink-0`)
- 메인 헤더 인사말 제거, 사용자명 표시
- 헤더 배경 제거 + 로그아웃 버튼 삭제 (UX 단순화)
- `theme-color`을 앱 배경색(#F2F4F6)으로 통일
- ESLint `any` 타입 빌드 오류 수정

**결정 사항**
- 재고 이동은 새로운 입고관리 레코드를 만들어 비고="재고 이동"으로 마킹 — 기존 입고 흐름과 동일 처리
- 보관처 텍스트 필드 → Link로 마이그레이션 (정합성 + 비용 이력 조인 가능)
- 결재 수신함은 펜딩 + 최근 14일 완료분만 표시

**미해결 이슈**
- 기존 재고 200건 비용 일괄 업데이트 (보관처 Link 통일로 일부 해결됐을 수 있음 — 사용자 확인 필요)

**다음 작업 후보**
- 재고 조회 화면 3단계 플로우 (B안)
- 다건 출고/이동 (UX 통일)
- QR 스캔 입력

---

### 2026-04-28

**완료한 작업**
- 재고 조회 B안 구현 (조건 검색 → LOT 수량 선택 → 견적 요약 3단계)
- Phase 2: 품목명 자동완성 + 결과없음 UX + 출고/이동 연동
- 다건 이동 지원 + 출고 페이지와 카트 UX 통일 (`grid-cols-2`)
- QR 스캔 (출고와 동일 구조) + 헤더 미니버튼으로 통합
- 토스트 시스템 도입 (`lib/toast.ts` + `Toaster.tsx`)
- 입고 카트화 + 오프라인 감지 + pull-to-refresh
- `console.log` → `lib/logger.ts` 운영 로거로 일괄 교체 (production 노출 차단)
- 로그인 화면 리디자인 — 블루 헤더 + 물고기 워터마크 + 카드형 작업자 목록
- `"use server"` 디렉티브 최상단 이동 (빌드 오류 수정)

**결정 사항**
- 재고 조회는 단계별 플로우(B안) 채택 — 한 화면에 다 넣지 않고 단계 구분
- 출고·이동 카트 UX를 통일 (다건 일괄 처리 + 동일 디자인)
- 토스트 도입 — alert 일괄 교체는 후속 작업
- production console 노출 0 정책 — 모든 로그는 logger 통과

**미해결 이슈**
- alert이 폼 검증/오류 처리에 여전히 다수 남아 있음
- 단위 테스트 미도입 (테스트 인프라 자체가 없음)

**다음 작업 후보**
- vitest 도입 + 핵심 도메인 단위 테스트
- 서버 액션 권한 재검증 (현재는 클라이언트 의존)

---

### 2026-05-02

**완료한 작업**
- 로그인 블루 헤더 minHeight 185 → 259 (1.4배)

**결정 사항**
- 로그인 첫 인상 강화 (브랜딩 영역 확대)

**미해결 이슈**
- 물고기 워터마크가 다소 장난스러워 보인다는 피드백 (잠재)

**다음 작업 후보**
- 로그인 워드마크 강화 / 워터마크 추상화

---

### 2026-05-04

**완료한 작업**
- 로그인 물고기 워터마크 제거 + 추상 웨이브 + 워드마크 강화
- 재고 조회: 전체기간 토글 + 풀수량 체크박스 + 묶음 출고/이동 바텀시트
- LOT 카드 컴팩트화 + 입력 영역 리디자인
- 메인: 카드 desc 차별화 + KPI 결재대기 2-카드 + 탭 딥링크
- **서버 액션 권한 검증** (`requireWorker`/`requireAdmin` — Airtable에서 직접 role 조회) **+ PIN 무차별 대입 방지** (5회 5분→30분 escalation, 인-메모리)
- 묶음 부분 실패 결과 화면 (B안) + 운영 개선
- **vitest 도입** + 입력 sanitize + 운영 로거 정리 + 비용 계산 모듈 분리
- 단위 테스트 첫 도입: server-auth / input-sanitize / number-format / cost-calc / pin-rate-limit (총 103건)

**결정 사항**
- vitest 채택 (Jest 대비 가벼움 + ESM 지원 좋음)
- PIN rate limit은 인-메모리로 1차 도입 (Vercel 분산 환경 한계 인지하되 운영 규모상 무방)
- 묶음 부분 실패는 B안(성공·실패 분리 결과 화면)으로 — 사용자가 어떤 LOT이 실패했는지 즉시 인지

**미해결 이슈**
- PIN 평문 저장 (Airtable에 그대로) — 보안 점검 필요
- rate limit 인-메모리 한계 — 인스턴스 분리 시 우회 가능
- API 라우트들의 권한 검증 누락 (`/api/outbound-complete` 등 — 클라이언트가 보낸 ID만 신뢰)

**다음 작업 후보**
- API 라우트 권한 검증 보강 (Critical)
- 결재 반려 시 재고 자동 복구 (현재 단순 상태만 변경 → 유령 재고)
- LOT 일련번호 동시성 보호

---

### 2026-05-05

**완료한 작업**
- PIN 키패드 백스페이스 ⌫ 유니코드 → SVG 아이콘 + 키 톤 통일

**결정 사항**
- PIN 키패드 12개 키 시각·동작 일관성 (SVG / 동일 색·크기 / disabled 페이드 통일)

**미해결 이슈**
- 5/4에서 발견한 보안·정합성 항목들 그대로 누적

**다음 작업 후보**
- 본격적 보안 패치 (Critical 4건)
- 결재 반려 정합성

---

### 2026-05-06

**완료한 작업** (15 커밋, 단일 날짜 최다)

보안 (3건):
- **Critical 4건 패치**: ADMIN_SECRET 강제 / 디버그 API production 차단 / `/api/outbound-complete`·`/api/inbound-receive` 신원 검증
- **PIN scrypt 해시화** + 자동 점진 마이그레이션 + rate limit **Airtable 영속화**
- POST 라우트 **idempotency** (X-Idempotency-Key + 5분 메모리 dedup)

정합성 (3건):
- **결재 양방향 변경**: 승인 ↔ 반려 토글 시 재고 자동 복구 (입고 soft delete, 출고 +outQty, 비용 7필드 null)
- **LOT 일련번호 동시성** 낙관적 재시도 (~99% 보호)
- 출고 승인 **멱등 가드** (출고시점 판매원가 > 0 시 차단) + EXPENSE **100만원 권한 서버 재검증**

UX (3건):
- 자동 로그아웃 **5분 전 배너** + "로그인 연장" 버튼
- **alert → toast 일괄 교체** (23개) + 로그인 iOS status bar 색(#3182F6)
- 검색 필터 **URL 쿼리 동기화** (재고 조회/신청 내역/결재 수신함, 디바운스 300ms)

운영 (2건):
- **일일 정산 이메일 cron** (Resend + Vercel Cron, 매일 09:00 KST) — 어제 처리분 상세 + 손익 추정 + 결재 대기 분리
- pin-rate-limit `let → const` lint 수정 + 누적 경고 정리 (Vercel 빌드 실패 fix)

타입·테스트 (2건):
- **Airtable 응답 zod 검증** (모니터링 모드, 9개 스키마 + TRANSFER 보강) + `[SCHEMA-MISMATCH]` 로그
- **통합 테스트 21개 시나리오** (Vitest, in-memory store + fetch 모킹, 12 files / 45 pass)

**결정 사항**
- 모든 신규 검증은 **모니터링 모드 우선** (실패해도 기존 흐름 그대로) — 운영 회귀 위험 0
- 정합성 위험 지점에 `[INTEGRITY-ALERT]` prefix 로깅 (운영자가 grep으로 추적)
- TRANSFER 반려 자동 복구는 **미구현** (LOT 중복 생성 위험) — 수동 보정 + 명시 로그
- LOT 동시성 race window 1ms 미만은 **솔직히 문서화** (옵션 A — Airtable 자동번호 도입은 향후)
- 100% 보호보다 **외부 의존성 0 + 1인 운영 환경 적합성** 우선
- 일일 보고서 기준일 = 입고일/출고일/이동일/지출일 (createdTime 아님)
- alert을 무조건 toast로 바꾸지 않고 **메시지 무게에 맞게 분리** (toast / 인라인 / 모달)

**미해결 이슈**
- TRANSFER 반려 자동 복구 (의도된 미구현, 수동 보정)
- 인라인 폼 에러 메시지화는 부분 (toast 통일까지만 1차 완료)
- LOT 동시성 1ms race window (Airtable 자동번호 도입 시 100% 해결)
- PWA 홈 화면 추가 시 status bar 색은 iOS 제약상 유지 (사용자 합의)
- 4월 진행 중 메모 3건(갈치/200건/품목마스터) — CLAUDE.md에서 사용자 확인 필요로 표시

**다음 작업 후보**
- GitHub Actions에 `npm run test:all` 통합 (PR마다 자동 검증)
- TRANSFER 반려 자동 복구 (사용 빈도 낮으나 운영 부담 시)
- Vercel KV 도입으로 idempotency·LOT 동시성 100% 보호
- FIFO 평단가 시스템 (장기)
- 부자재 재고 확장 (장기)
- 검색 결과 자동 트리거 (URL 복원 시 검색 자동 실행 옵션)

---

### 2026-05-07

**완료한 작업**
- 일일 보고서 deliverability 디버깅 — Vercel Cron 정상 발화(00:27 UTC)·Resend API 200 응답 확인. 미도착 원인은 발송 도메인(`onboarding@resend.dev`)과 본문 링크 도메인(`seafood-erp.vercel.app`) mismatch로 인한 spam 필터 트리거. Resend Insights "Needs attention" 경고로 확정.
- 일일 보고서 본문 CTA 링크 제거 (`fix(cron)` — 44aac2c) + `NEXT_PUBLIC_BASE_URL` 사용 분기 / JSDoc 정리
- 입고 폼 라벨 단순화: `매입처 (출발)` → `매입처`, `보관처 (도착)` → `보관처` (`app/inventory/record/page.tsx`)
- 종합 점검 분석 5섹션 — 미해결 이슈 / 안정성 점검 / 운영 모니터링 / 사용자 가이드 / 핵심 지표 (개발자 관점, 본인 참고용)
- 첫 운영 회의 자료 HTML 작성 (`meeting-2026-05-07.html`) — 시스템 처음 보는 팀원용. Part A 시스템 소개(용어 12개 + 데이터 흐름 다이어그램) + Part B 기능 설명서(9개 카드) + Part C 운영 결정 의제 10개
- 회의 자료 글로서리·인쇄 CSS 수정 — PIN 4자리, 수매가 "박스당 가격", 판매원가 누적냉장료. 인쇄 시 헤더+목차 1면 / 각 Part 새 페이지 / 카드 단위 끊김 방지
- SEAERP Obsidian vault 구조화 — 모듈 20 / 결정 41 (확정 22 / 미해결 19) 노트 일괄 생성 (`30_모듈별_상세/`, `40_결정기록/`)
- 모듈 ↔ 결정 양방향 [[wiki-link]] 연결 — 모듈 노트 19개 + 결정 노트 33개 편집 (PWA 모듈·meta 결정 8건은 매핑 없음으로 의도적 보류)
- 코드 vs 노트 정합성 점검 — 분석 표의 "재고 조회" 코드 위치 `app/inventory/lookup/`은 오기, 실제 `app/inventory/status/page.tsx`로 정정
- 재고조회 ↔ 출고 관계 코드 검증 — 두 페이지가 별도 UI지만 `createOutboundRecord` 서버 액션을 공유, UI 카트 상태는 미공유 (`app/inventory/status/page.tsx:235`)
- 옵시디언 vault 시나리오 **23개** 발굴 (A7+B4+C3+D4+E2+F3, E3는 입고증 재출력 코드 검증 0건으로 미생성) + 6 카테고리 분류
- 모듈 노트 21개에 `## 등장하는 시나리오` 섹션 추가 (102 링크), 결정 노트 49개에 `## 영향받는 시나리오` 섹션 추가 (84 링크), 시나리오 ↔ 시나리오 64개 (32쌍 양방향)
- QR 트리거 코드 검증 — `lib/generate-pdf.server.tsx:306-322 generateInboundPdf`에서만 QR 생성. 출고증/지출결의서 PDF는 QR 없음 (사용자 메모와 반대 사실 — 결정 노트에 정확히 반영)
- QR 통일안 반영 — `QR_LOT_식별자_통합` 신규 결정 (입고 시 생성 / LOT 평생 식별자 / 통합 랜딩 페이지로 라우팅 / 구현 미정), 기존 2개 (`QR_스캔_재고조회_전용` 보강, `QR_스캔_라우팅_변경_검토` 미해결→확정)
- `/wrap-up` 명령에 옵시디언 동기화 단계 4.5 추가 (4.5-A: CLAUDE.md→00 / 4.5-B: z.Mission→01 / 4.5-C: journal→10_작업일지/{날짜}) + 격리 안전장치 (vault 없거나 sub-step 실패해도 1~7단계 흐름 정상 진행)
- A5 시나리오 사용자 수정 반영 — 거치는 모듈에서 `재고_이동` 제거, BulkSubmitSheet 직접 출고 흐름 명시
- A6 시나리오에 F3 흡수 — PIN 평문→scrypt 해시 자동 마이그레이션을 별도 시나리오 X, A6 6번 단계로 통합

**결정 사항**
- 도메인 mismatch 임시 조치 = CTA 링크 제거 — 자체 도메인 구매 전까지 유지. 이상적 fix는 도메인 인증 후 발신/링크 도메인 통일이지만 현재 구매 계획 없음
- 종합 점검 분석은 비개발자용 회의 자료와 분리 — 개발자 측면(PIN 해시화 / Idempotency / zod / [INTEGRITY-ALERT] 등) 디테일은 회의 자료에서 모두 제외, 본인 참고로만
- 회의 자료 의제 10개는 모두 "왜 결정해야 하는가" + "무엇을 결정할지" 분리 구조 — 시스템 자체 설명과 의사결정 항목을 명확히 구분
- 회의 자료 인쇄는 4파트 분리 (헤더+목차 → Part A → Part B → Part C → 결정 사항) — 각 시작이 새 페이지
- QR 스캔 = 재고 조회 전용으로 책임 한정 — 다중 출고는 카트 UX, QR은 출고증 정보 빠른 조회. 다중 LOT QR 연속 스캔 흐름은 만들지 않음
- vault 노트 형식 = 모듈(역할 / 코드 위치 / 현재 상태 / 관련 결정사항 / 의존 모듈) + 결정(상태 / 한 줄 요약 / 결정 내용 / 영향받는 모듈) — 양방향 링크가 그래프뷰에 그려지도록 통일
- vault 파일명 규칙 = 한글 + 언더스코어, 공백·특수문자 금지
- PWA 모듈은 세션·자동로그아웃과 분리, 상태 = "계획 단계"로 표기 — 향후 실제 앱 제작 시 재검토
- QR = LOT 평생 식별자 — 입고 시 생성 → 출고/조회 모두 같은 QR. 스캔 시 통합 LOT 랜딩 페이지(/lot/{번호})로 라우팅 후 권한·상태별 액션 분기 (조회 / 출고 / 이동). 구현 시점 미정
- 시나리오 노트 형식 = 트리거 / 흐름(번호 매김) / 모듈 간 데이터 흐름 / 관련 결정사항 / 미해결 결정의 영향 / 영향받는 코드 파일 / 구현 상태 / 관련 시나리오 — 양방향 wiki-link로 그래프뷰 형성
- 시나리오 안에서 모듈/결정 가리킴은 폴더 prefix `[[30_모듈별_상세/...]]` / `[[40_결정기록/...]]`, 시나리오끼리는 `[[50_시나리오/...]]` — 그래프뷰에서 카테고리별 시각 분리
- /wrap-up 옵시디언 동기화는 **격리 실행** — vault 없으면 조용히 스킵, sub-step 실패해도 echo 경고만 stderr로 내고 1~7단계 흐름 정상 진행 (운영 회귀 위험 0)
- 메타·UI 9개 결정은 시나리오 직접 매핑 X — `(직접 매핑되는 시나리오 없음)` 명시 (그래프뷰 시각화 시 의도적 isolated 노드)

**미해결 이슈**
- 5/8 09:00 KST 일일 보고서 자동 도착 여부 확인 필요 — CTA 제거 효과 검증
- 자체 도메인 구매 검토 — 구매 시 발신 도메인 인증 + 본문 링크 도메인 통일로 deliverability 100% 해결
- 입고 승인 멱등 가드 추가 — idempotency cold start 시나리오에서 LOT 중복 생성 위험 (출고는 멱등 가드 있음)
- `ApprovalButtons`의 idempotency-key 생성 로직 검증 — 양방향 변경 시 매 요청 새 key 보장 여부
- 운영 회의 진행 후 마스터 데이터 cleanup (갈치 품목코드 / 보관처 비용 이력 누락 200건 / 매입처·보관처 마스터 정리 등)
- 사용자 가이드 누락 항목 (PIN 잠금 / 양방향 변경 / QR 스캔 / 자동 로그아웃 경고) 안내 방법 결정
- QR 스캔 라우팅 변경 검토 — 출고증 PDF QR이 `/inventory/outbound?lot=...`인데 "재고 조회 전용" 결정에 따라 `/inventory/status?lot=...`로 변경할지 미정 (`lib/generate-pdf.server.tsx:311`)
- vault 시나리오 발굴 미진행 — 사용자 액션 / 데이터 흐름 / 의사결정 의존 / 결재·권한 / 인쇄·문서 / 자동화 6유형으로 모듈 간 흐름 정리 작업이 검토 단계에서 /wrap-up으로 중단
- QR 통합 LOT 랜딩 페이지(/lot/{번호}) 신규 개발 — 결정은 ✅ 확정이지만 구현 미진행
- 출고증 PDF에 QR 추가 — 현재 입고증에만 QR (코드 검증 결과). 통일안 적용 시 출고증 QR도 추가 필요
- 빈 폴더(20_단기과제_완료 / 21_중기과제_진행중 / 22_장기과제_예정 / 60_관계도) 활용 전략 수립 — 시나리오는 50에 채워졌으나 나머지 4개 폴더 아직 빈 채

**다음 작업 후보**
- 내일 아침 일일 보고서 도착 확인 후 다음 단계 (도메인 검토 / 추가 조치)
- 운영 회의 진행 + 합의된 cleanup 작업 (갈치 LOT 사후 처리 / 비용 이력 보충 / 매입처 마스터 정리)
- 입고 승인 멱등 가드 추가 (출고와 동일한 안전장치)
- GitHub Actions에 `npm run test:all` 통합
- vault 시나리오 발굴 (모듈 간 흐름 6유형) 재개 + 검토 후 시나리오 노트 작성 (모듈·결정과 양방향 링크)
- /wrap-up 4.5 동기화 dry run 검증 후 운영 적용 — 다음 wrap-up부터 옵시디언도 자동 sync
- QR 통합 LOT 페이지 구현 착수 시점 결정 (운영 회의 후)
- 빈 폴더(20/21/22/60) 활용 전략 — 단기·중기·장기 과제 별도 카드화 vs 미해결 결정으로 통합 운영 검토
- 옵시디언 그래프뷰 시각 검증 — 시나리오 노드 분포·고립 노드(메타 결정 등) 확인

---

### 2026-05-08

**완료한 작업**
- `/wrap-up` 회사 PC dry run 검증 — vault 경로 불일치(`~/seafood-erp/` 하드코드) 발견. `git rev-parse --show-toplevel` 기반 상대경로로 환경 독립화 (mac `seafood-erp` / Windows `.seaerp` 양쪽 동작) (`a9fb1ff`)
- 옵시디언 vault 빈 폴더 4개 생성 (`20_단기과제_완료` / `21_중기과제_진행중` / `22_장기과제_예정` / `60_관계도`)
- `60_관계도/` Mermaid 시범 3종 작성 — `ERP_핵심구조_큰그림.md`(graph TD subgraph 분류), `LOT_의존성_상세.md`(LOT 중심 의존), `입고_시나리오_플로우.md`(sequenceDiagram + flowchart)
- `/wrap-up` 4.5-D 단계 신설 — 60_관계도/ 자동 갱신 (`98fe242`)
  - 4.5-D-1: ERP_핵심구조_큰그림.md (3그룹 subgraph, mermaid 큰 그림)
  - 4.5-D-2: 시나리오_플로우/{A1~A5}.md (sequenceDiagram 자동 생성, 트리거 첫 단어 → first actor 추출, `## 흐름` numbered step 파싱, link 없는 step은 `Note over` 폴백)
  - 동일 내용 시 write 스킵(idempotent), 격리 안전장치(`sync_relations` 함수)
- 큰 그림에 `조회 → 출고`, `조회 → 이동` edge 누락 보강 (A2/A3/A5 등장 흐름) (`8ef535f`)
- 큰 그림 인프라 subgraph에 Airtable 노드(cylinder DB shape) + LOT/결재 점선 edge 추가 (`4f37755`)

**결정 사항**
- vault 경로는 `git rev-parse --show-toplevel` 기반 — `~/seafood-erp/` 하드코드 제거. 어느 환경에서든 ERP 루트 자동 감지
- 4.5-D-1은 **create-if-missing** 정책 — 파일이 있으면 절대 건드리지 않음. 사용자 수동 편집 보존이 자동 갱신보다 우선 (시스템 구조 변경은 직접 파일 편집)
- 4.5-D-2는 `## 흐름` 변경 감지 시만 갱신 — write_if_changed로 git diff 0 보장
- first actor는 트리거 첫 줄 "X가/이 Y" 패턴 추출 (예: "작업자가 입고 폼 제출" → "작업자"). 흐름 step에 다른 actor 등장 시 추가 participant
- Airtable은 `[(...)]` cylinder shape (DB 의미)로 인프라 subgraph에 표현. 모든 허브(LOT/결재) 점선 edge로 데이터 의존 표시

**미해결 이슈**
- 60_관계도 prototype 2개(`LOT_의존성_상세.md`, `입고_시나리오_플로우.md`)와 자동 생성 `시나리오_플로우/A1_*.md` 일부 중복 — 정리 검토 필요
- B/C/D/E/F 시나리오는 시퀀스 다이어그램 자동화 미적용 (현재 A1~A5만)
- 모듈 노트에서 Airtable 명시적 [[link]] 매핑 부재 (현재 plain text only)
- `현재 진행 중` 4월 메모 3건(갈치/200건/품목마스터) 여전히 누적

**다음 작업 후보**
- 운영 회의 진행 + 합의된 cleanup (갈치 LOT 사후 처리 / 비용 이력 보충 / 매입처 마스터)
- B/C/D/E/F 시나리오도 4.5-D-2 자동화 확장
- 60_관계도 prototype 정리 (시나리오_플로우와 중복 제거)
- 입고 승인 멱등 가드 추가 (출고와 동일 안전장치)
- GitHub Actions에 `npm run test:all` 통합
- QR 통합 LOT 페이지(/lot/{번호}) 구현 착수 시점 결정

---

### 2026-05-11

**완료한 작업**
- 1~2주 테스트 운영 직전 종합 점검 — 5개 fork 병렬 (미해결 이슈 / 안정성 / 모니터링 / 사용자 가이드 / 운영 지표). 운영 차단 후보 5건, 안정성 위험 [중] 4건(E1~E4), 사용자 안내 시급 5건, 회고 5질문 정리
- 점검 결과 HTML 보고서 작성 — `pre-launch-audit-2026-05-11.html` (42KB, 토스 스타일 #3182F6/#191F28, 7 섹션 + D-1 체크리스트 17개 항목, 인쇄 친화 CSS + 모바일 반응형, 체크박스 동작)
- QR 스캔 단일화 영향 범위 분석 — 5개 fork 병렬 (BarcodeScanner 사용처 / 출고·이동 폼 영향 / 메인 화면 위치 / LOT 상세 페이지 현황 / PDF QR URL + callbackUrl 패턴)
- 의사결정 5건 수합 — 옛 PDF redirect / 옵션 A 메인만 / PC도 표시+안내 / 재고 정보만(이력 X) / NEXT_PUBLIC_BASE_URL 도입
- 0단계 스키마 확인 — `잔여수량`/`매입자`/`선박명` 모두 입고관리 테이블에만 존재 (LOT엔 `매입처` link만). LOT.입고관리링크 (LinkedRecord)로 join 가능 확인
- 작업 5단계 순서 task 등록 — LOT 상세 페이지·API → PDF URL → 메인 QR → 폼 정리 → callbackUrl 보강
- **QR 단일화 5단계 완료** (커밋 `392f6b7`) — `lib/lot-detail.ts` join 헬퍼 + `app/api/inventory/lot/[lotNumber]/route.ts` + `app/inventory/lot/[lotNumber]/page.tsx` 신규 / `lib/base-url.ts` + `NEXT_PUBLIC_BASE_URL` 도입, PDF QR URL 교체 / 메인 헤더 QR 버튼 + 옛 `?lot=` redirect / 출고·이동 폼 BarcodeScanner 제거 / WorkerPinLogin callbackUrl 보강 (`safeCallbackUrl` open-redirect 차단)
- 출고/이동 검색 라벨·예시 통일 (커밋 `a64d2b9`) — "품목명 또는 LOT번호" / "예: 고등어, 0001"
- 페이지 일관성 정리 8건 (커밋 `be70dae`) — HIGH 3 (라벨 명사형 / "~하기" 제거 / "BOX"→"박스") + MED 4 (placeholder "예 :" → "예:" / 지출 submit cursor-not-allowed / 이동 헤더 의문형 / admin 빈결과·로딩 문구) + LOW 1 (`window.confirm` 4곳 → `useConfirm()` BottomSheet, 신규 `app/components/ConfirmBottomSheet.tsx` Context/Provider 도입)
- E1~E4 안정성 가드 plan 수령 — Plan agent로 audit + 의사코드 + 우선순위표(E1·E4 1·2순위 / E3 3순위 / E2 모니터링만) + 통합테스트 4개 신규 권장

**결정 사항**
- QR 스캔 용도 = "재고 정보 빠른 조회" 단일화 — 출고/이동 폼 QR 버튼 제거, 메인 화면 우측 상단에 글로벌 QR 버튼 추가. 앱 내 스캔 + 아이폰 기본 카메라 모두 동일 URL(`/inventory/lot/{lotNumber}`)로 라우팅
- QR 버튼 글로벌 범위 = 옵션 A (메인 화면만) — PageHeader 확장은 운영 후 필요시 추가. BottomTabBar 재고 조회 진입점이 이미 있어 1탭 비용 수용 가능
- PC 처리 = 옵션 B (항상 표시) — 클릭 시 "모바일에서 사용 가능" 안내 메시지. hasCamera 가드로 숨김 안 함
- LOT 상세 정보 = 재고 정보 8필드만 (입출고 이력 미포함) — LOT번호+QR 이미지 / 품목명 / 규격·미수 / 보관처 / 재고수량·입고수량 / 입고일 / 누적 보관일수 / 매입처·매입자·선박명
- 잔여수량·매입자·선박명 접근 = 코드 join — Airtable lookup 필드 추가 X. API에서 LOT 조회 → 입고관리링크 ID로 입고관리 fetch → 매입자(LinkedRecord)로 작업자 fetch. 실시간 동기화 + Airtable 조작 0
- NEXT_PUBLIC_BASE_URL 도입 — PDF QR URL 호스트 분리 (Production: `https://seafood-erp.vercel.app`, 개발/스테이징 환경 분리 가능)
- 옛 PDF 인쇄본 호환 = `/inventory/outbound?lot=...` 진입 시 자동 redirect — outbound page useEffect로 LOT 상세로 이동
- callbackUrl 흐름 = open-redirect 차단 추가 — `safeCallbackUrl()` 헬퍼로 절대 path만 허용, decode 실패·외부 URL·protocol-relative URL 모두 null 반환. WorkerPinLogin 이미 로그인 + `/login?callbackUrl=...` 직접 방문 시도 존중
- HTML 보고서는 위험도 색 시스템(critical/high/medium/low/info/pending)을 `meeting-2026-05-07.html`과 일관
- 출고/이동 검색 라벨 = "품목명 또는 LOT번호" 통일 — "LOT 일련번호"는 끝자리만 의미하는 뉘앙스가 있어 "LOT번호"가 정확. 검색 로직(LOT번호 끝자리 숫자 + 품목명 substring)은 이미 동일
- 버튼 문구 = 명사형 통일 — "~하기" 제거, "+ X 목록에 추가" / "X 신청 (N건)" 입고·출고·이동·지출 4개 폼 동일 패턴
- 단위 표기 = "박스" 한글 통일 — "BOX" 영문은 사용자 친숙도 낮음. Airtable 필드명("입고수량(BOX)")은 데이터 호환 위해 유지, UI만 한글화
- `window.confirm` 대체 = Promise 기반 BottomSheet — 새 `ConfirmBottomSheet` Context로 `await confirm({title, accent, ...})` 인터페이스. chained confirm(승인 → 중간승인 생략) 지원. RejectBottomSheet와 디자인 토큰 일관
- LOW 9·10 (rounded 위계 / gray 톤) = 유지 — 디자인 토큰 작업이라 별도 세션 권장, 운영 직전 회귀 위험 회피
- E1~E4 적용 정책 = minimal patch + 모니터링 모드 우선 — Plan agent 권장. E1·E4는 실제 사용 경로(승인/반려 토글)라 가드 즉시 가치, E2는 1인 운영 빈도 낮아 mutex 도입 대신 race 모니터링 로그만, E3는 PWA 코너 케이스

**미해결 이슈**
- **🔴 E1~E4 안정성 가드 적용 대기** — Plan agent로 audit + 의사코드 완료. **다음 세션 시작 지점**. 적용 범위 옵션 4개 사용자 결정 대기:
  - (a) **E1만** — 2~3h. 이중 차감 가드(가장 위험 높은 1건) 후 검증
  - (b) **E1 + E4** — 5~7h. 실제 사용 경로(승인·반려 토글) 두 곳 보완
  - (c) **E1 + E3 + E4 (권장)** — 6~9h. 코너 케이스(idempotency body hash) 추가. E2는 모니터링 후 결정
  - (d) **4건 전부** — 10~15h. E2 mutex 도입 포함 (회귀 위험 있음)
  - 각 건당 통합 테스트 신규 1개씩 권장 (`outbound-cost-patch-fail.test.ts` / `outbound-reject-lot-fail.test.ts` / `idempotency-payload-mismatch.test.ts` / `outbound-bulk-race.test.ts`)
  - 영향 파일: `app/actions/admin/admin.ts` (E1·E2·E4), `lib/idempotency.ts` (E3)
- legacy 페이지 정리 대기 — `app/admin/approvals/page.tsx` (메뉴 없음, 토이 로그아웃), `app/expense/record/page.tsx` ("원물 입고 등록" 타이틀, 사용 여부 불확실)
- 운영 D-1 체크리스트 17개 항목 전체 미시작 — 갈치 LOT 16건 / 200건 보관처 비용 / 품목마스터 / 매입처·매입자·선박명 폼 필드 불일치 (CLAUDE.md ↔ `InboundForm.tsx`)
- 일일 보고서 5항목 추가 미진행 — INTEGRITY-ALERT 카운트 / 음수 재고 / 잠긴 PIN / 결재 평균 소요시간 / 출고시점 비용 NULL (E1 조기 발견)
- 사용자 안내 시급 5건 사내 공지 미작성 — PIN 잠금 escalation / 자동 로그아웃 메커니즘 / QR 스캔 / 폼 필드 / 신청 결과 알림
- "동결비" 필드 처리 의도 결정 미완 — 결정 노트 부재 (사용자 확인 필요)
- Airtable view 4개 미생성 — 음수 재고 / 24h stale / 잔여수량&gt;입고수량 / 잠긴 PIN
- LOW 9·10 정리 보류 — rounded 위계 / text-gray-* 톤 디자인 토큰 작업 (별도 세션)

**다음 작업 후보**
- **🔴 1순위: E1~E4 안정성 가드 적용** (다음 세션 시작 지점)
  - 진입: 사용자에게 옵션 4개 (a/b/c/d) 중 적용 범위 결정 받기 → 적용 진행
  - E1 (admin.ts:598-606): `await patchRecord(...)` 반환값 미검사 → 실패 시 재고 원복 + INTEGRITY-ALERT
  - E4 (admin.ts:627-748): 출고 반려 LOT 복구 실패 시 입고 잔여 보상 트랜잭션(원복) 추가
  - E3 (lib/idempotency.ts:59-115): body SHA256 hash 비교, mismatch 시 409 `payload_mismatch`
  - E2 (admin.ts:550-579): per-record in-memory mutex + before/after race 감지 모니터링 로그
  - 통합 테스트 4개 신규 (E2는 mutex 도입 시에만)
  - 권장: (c) E1 + E3 + E4 — 실 경로 보완 + 코너 케이스 디펜스, E2는 1인 운영 빈도 낮음
- 2순위: 일일 보고서 5항목 추가 (`lib/daily-report.ts`) — E1 조기 발견 알람
- 3순위: legacy 페이지 정리 — `app/admin/approvals/page.tsx`, `app/expense/record/page.tsx` 라우팅 확인 후 제거
- 운영 D-1 데이터 작업 (Airtable 직접) — 갈치 LOT backfill / 200건 보관처 비용 / 품목마스터 / 폼 필드 정합성
- 사용자 안내 사내 공지 1장 작성 후 직원 배포
- `pre-launch-audit-2026-05-11.html` 운영 회의에서 공유

---

### 2026-05-12

**완료한 작업**
- E1~E4 운영 안정성 가드 4건 일괄 적용 (커밋 `1455484`) — E1 출고비용 PATCH 실패 가드 + E4 출고 반려 LOT 복구 보상 트랜잭션 + E3 idempotency body SHA256 hash 비교(다른 body → 409 `payload_mismatch`) + E2 출고 결재 race 모니터링 모드 (`[OUTBOUND-RACE-MON]` 로그, mutex 도입 X). 통합 테스트 12건 신규 (`outbound-cost-patch-fail`/`outbound-reject-lot-fail`/`idempotency-payload-mismatch`/`outbound-bulk-race`) + `injectFault()`/`clearFaults()` 테스트 인프라
- legacy 페이지 2개 정리 (커밋 `b9474dc`) — `app/admin/approvals/page.tsx` (옛 프로토타입, 메뉴 없음) + `app/expense/record/page.tsx` (URL `/expense/record`인데 타이틀이 "원물 입고 등록"으로 모순, 한글 필드명 리팩터링 반영 안 됨). 외부 참조 0건 확인 후 제거
- PWA 설치 가능 완성 (커밋 `6c35d42`, **Phase 0 완료**) — Android Chrome 192/512 아이콘 + apple-touch-icon 180×180 정규화 + favicon 32×32 + manifest theme_color #F2F4F6 통일 + sharp 기반 아이콘 재생성 스크립트
- 모바일 PWA + PC PWA 분리 아키텍처 방향성 결정 (커밋 `f5c8dc9`) — CLAUDE.md에 단일 코드베이스/두 PWA 구조 명시 + `docs/ROADMAP.md` 신규 (Phase 0~5+ 상세 계획)
- 최소 수정 원칙 의미 명확화 (커밋 `1705194`) — "잘 작동하는 기능은 건드리지 않음" 항목을 최소 수정 원칙에 흡수 통합, 계획된 변경 vs 의도하지 않은 변경 구분, 원칙 유래(AI 과잉 리팩토링 경험) 기록
- Phase 1 Step 0 — outbound 정책 정렬 (커밋 `25293e1` 계획 → `e26873b` 1단계 → `59d7a5f` 2단계) — `test/integration/outbound-bulk-policy.test.ts` 4 시나리오 안전망 신규 (자연 거절 활용, fault injection 미사용) → `app/inventory/outbound/page.tsx` `handleSubmitAll` status 패턴 정렬 (첫 실패 abort 제거, successCartIds/failures 분리 누적, 결과 패널 inline, 실패 N건 재시도)

**결정 사항**
- E1~E4 적용 범위 = 4건 전부 (옵션 d), 단 E2는 모니터링 모드만 도입 — mutex 도입은 회귀 위험 + 1인 운영 빈도 낮아 보류
- 프로젝트 아키텍처 방향 = 단일 Next.js 코드베이스 + 두 개의 PWA (모바일=작업자, PC=관리자) — Airtable이 하던 마스터 데이터 관리 역할을 PC PWA로 흡수, PostgreSQL 이전은 조건부 미래 단계
- Phase 0~5+ 로드맵 신규 작성 (`docs/ROADMAP.md`) — Phase 0 ✅ / Phase 1 모바일 UX 다듬기 / Phase 2 백엔드 부채 / Phase 3 PC 화면 신설 / Phase 4 시범 출시 + 피드백 / Phase 5+ 조건부 (PostgreSQL 등)
- Phase 1 Step 0 = outbound handleSubmitAll 정렬 (UI 작업 전 회계 안전 우선) — B안 = 부분 성공 허용 + 결과 화면 표시 (전체 롤백 아님)
- Step 0 분할 = 1단계 회귀 방지 안전망 통합 테스트 4건 → 2단계 client 코드 정렬 — 1단계 코드 변경 0건 원칙 준수, 2단계는 안전망 위에서 진행
- BulkResultsPanel 컴포넌트 추출 = Phase 1 Step 1로 분리 — outbound + status 페이지 결과 패널 inline JSX 일괄 추출 예정 (Step 0에서는 도메인 차이 유지 + outbound에 inline 패턴 그대로 복제)
- 최소 수정 원칙 정의 = "계획된 작업은 가능 / 작업 범위 밖 코드는 손대지 않음" — 잘 작동하는 기능은 우선 보호, 리팩토링 필요 시 별도 작업으로 분리 제안

**미해결 이슈**
- Phase 1 Step 1 — `BulkResultsPanel` 컴포넌트 추출 대기 (outbound + status 중복 JSX 일괄 처리)
- Phase 1 본격 모바일 UX 다듬기 항목 미시작 — 우선순위 정리 필요
- 일일 보고서 5항목 추가 미진행 — `[INTEGRITY-ALERT]` / `[OUTBOUND-RACE-MON]` 카운트 / 음수 재고 / 잠긴 PIN / 결재 평균 소요시간
- 운영 D-1 체크리스트 데이터 작업 17개 항목 — 갈치 LOT 16건 / 200건 보관처 비용 / 품목마스터 / 매입처·매입자·선박명 폼 필드 정합성
- 사용자 안내 시급 5건 사내 공지 미작성 — PIN 잠금 / 자동 로그아웃 / QR 스캔 / 폼 필드 / 신청 결과 알림
- "동결비" 필드 처리 의도 결정 미완 (사용자 확인 필요)
- Airtable view 4개 미생성 — 음수 재고 / 24h stale / 잔여수량>입고수량 / 잠긴 PIN
- LOW 9·10 (rounded 위계 / gray 톤) 디자인 토큰 정리 보류

**다음 작업 후보**
- Phase 1 Step 1 — `BulkResultsPanel` 컴포넌트 추출 (outbound + status 공통화, props로 accent 색만 분기)
- Phase 1 본격 진행 — 모바일 UX 다듬기 항목 우선순위 정리 후 착수
- 일일 보고서 5항목 추가 (`lib/daily-report.ts`) — E1/E2 조기 발견 알람
- 운영 D-1 데이터 작업 (Airtable 직접) — 갈치 LOT backfill / 200건 보관처 비용 / 품목마스터 / 폼 필드 정합성
- 사용자 안내 사내 공지 1장 작성 후 직원 배포

---

### 2026-05-13

**완료한 작업**
- Airtable MCP 서버 연결 — 세션 시작 시 인증·연결. 이번 세션의 인프라 전제. 베이스 `appUY0ZQ5L67FzySd` (운영 "수산업 ERP")를 MCP로 직접 조작 (테이블 스키마 조회, 신규 필드 6건 생성, 필드명 rename, formula 2건 갱신, LOT 197건 batch PATCH 마이그레이션·롤백). UI 우회로 운영 데이터 직접 검증·정리 가능했음.
- 동결비 통합 (1단계) — 입고 승인 시 보관처 비용 이력에서 동결비를 LOT에 PATCH + 입고 반려 시 null 클리어 + 출고 승인 시 출고시점 동결비 스냅샷 + 출고 반려 시 null 복구. `lib/storage-cost.ts` / `lib/cost-calc.ts` / `lib/schemas/outbound.ts` / `app/actions/admin/admin.ts` 4곳 수정. `lib/cost-calc.test.ts`에 동결비 합산 케이스 추가.
- 가공품 분기 전체 제거 (2단계) — Airtable에 실제 필드가 없는 `기준단위_재고`/`상세단위_재고` 코드 분기 12파일 정리. 박스 단위 / 재고수량 단일화. `stock-deduction.ts` 단순화, `shipment-plan.ts` mode/PBO 분기 제거, `OutboundQtyModal.tsx` mode 토글/수율오차 UI 제거. 가공품 흐름이 필요해지면 별도 모듈로 설계할 것 (메모리 저장).
- 옵션 B 완성 (3단계) — 재고 이동 시 새 LOT의 최초입고일은 원본에서 복사 + 이동입고일은 이동일 + 이월 4개(냉장료/입출고비/노조비/동결비)는 비례 분할로 분리 저장. `cost-calc.ts`에 `calculateTransferPricing` 신규 함수 추가, `transfer.ts:approveTransfer` 새 LOT 필드 정리.
- 누적 경비 계산 (4단계) — `calculateOutboundCost`에 이월 4개 합산 추가, Airtable formula 두 개(`판매원가`/`누적냉장료`)를 MCP로 직접 갱신 — 이동입고일 ?? 최초입고일 fallback + 이월 4개 합산.
- 기존 데이터 마이그레이션 (5단계) — Airtable LOT 197건 batch PATCH로 이동입고일 채움 → 사용자 의도 재확인 후 196건 롤백 (이동입고일 = null). 이동된 적 있는 LOT 1건(`recfFhdj2rVdHSgiR`)은 그대로 유지하고 최초입고일을 2026-04-13(원본 LOT 기준)으로 정정.
- 통합 테스트 7건 신규 (6단계, `test/integration/cost-carryover.test.ts`) — 입고 동결비 저장 / 입고 반려 동결비 null / 출고시점 동결비 / 출고 반려 동결비 복구 / 이동 시 이월 비례 분할 + 최초입고일 보존 / D1 재이동 누적 / 이동 후 출고 판매원가 합산.
- 운영 검증 체크리스트 신규 (`docs/CHECKLIST-COST-CARRYOVER.md`) — 6 시나리오 운영 환경 골든패스 검증용.
- 운영 골든패스 6 시나리오 검증 완료 — 입고/출고/이동/입고반려/출고반려/D1 재이동. 핵심 검증 통과: 이동입고일 빈칸 / 이월 4개 비례 분할 / 최초입고일 보존 / 출고시점 동결비 신규 PATCH·null 복구 / D1 재이동 이월 누적(289, 239 정확).
- 운영 검증 중 사전 존재 버그 4건 발견 + 모두 fix (5월 13일 추가 커밋):
  - `0e63896` `app/actions/inventory/inbound.ts` + `app/api/inventory/lot-search/route.ts` — LOT POST·검색 formula에서 "입고일자" → "최초입고일" rename 반영 누락. 이번 작업의 필드명 변경 후속 누락.
  - `037cbf0` `app/actions/inventory/inbound.ts` — LOT.품목구분이 운영 베이스에서 lookup으로 변경됐는데 코드가 텍스트 PATCH 시도 → 422 INVALID_VALUE_FOR_COLUMN. PATCH 제거 (lookup은 자동 계산).
  - `48ae928` `app/actions/inventory/transfer.ts` — 이동 새 LOT 생성 시 입고수량(BOX)/규격/미수 누락 → 총중량 formula = 0 → 판매원가 formula = 0. 옵션 B 이전부터 잠재, 이동 LOT 판매원가 계산이 정확해야 하면서 부각.
  - `f2f9974` `app/actions/inventory/transfer.ts` — 이동 새 LOT에 품목 link/품목명 누락 → LOT 검색·표시 시 품목명 빈 채. 재이동(D1) 시 원본도 비어있으면 품목마스터에서 fallback 조회.

**결정 사항**
- 동결비 입력 방식 = 옵션 b (보관처 비용 이력 테이블에 저장 + 입고 시 LOT으로 복사). 1회 발생 (입출고비/노조비/동결비) vs 일당 발생 (냉장료) 구분 유지.
- 이동 이력 추적은 별도 필드 없이 원본LOT 체인 + 이동입고일로 코드에서 동적 생성 (PC 화면 도입 시 구현). 데이터 중복 회피.
- 가공품 흐름은 단순 필드 추가가 아닌 별도 모듈로 설계 — 원물 → 가공공장 출고 → 가공 → 재입고(필렛) 체인은 새 시스템 필요.
- 이월 4개 필드 타입은 number → currency로 변환 (다른 비용 필드 일관성). `_tmp_삭제대상` suffix로 임시 rename 후 새 필드 생성, UI에서 수동 삭제.
- 최초입고일 = 진짜 처음 입고일 (모든 LOT). 이동입고일 = 이동 시에만 채움 (이동 안 된 LOT은 null). 코드/formula 모두 `이동입고일 ?? 최초입고일` fallback 패턴.
- 출고시점 이월 4개의 별도 스냅샷은 미추가 (총합으로 판매원가에 합산되므로 분해 저장 불필요). 출고시점 동결비만 신규.

**미해결 이슈**
- **알려진 flaky test — `test/integration/security.test.ts` pin_hash 시나리오** — 단독 실행 시 통과, 전체 동시 실행 시 가끔 fail. cost-carryover 제외하고 실행해도 동일 재현 → 사전 존재 이슈. 운영 코드 영향 없음. 별도 작업으로 디버깅 예정.
- `recfFhdj2rVdHSgiR` LOT의 이월 4개는 0 (옵션 B 도입 이전 이동분이라 추적 불가). 운영상 영향 작음 — 손익 과소 추정 가능. 최초입고일은 2026-04-13으로 정정 완료.
- **출고시점 판매금액 = 0 버그** — 운영 출고관리 테이블에 `판매금액` 필드가 없고 `판매가`만 있는데 `admin.ts:deductStockOnOutboundApproval`이 `outFields["판매금액"]`을 읽음 → 0. 손익 계산 부정확 (시나리오 2 검증에서 발견). 사전 존재, 옵션 B와 무관. 별도 작업.
- **재고 이동 반려 시 부분 복구 동작 관찰** — CLAUDE.md엔 "자동 복구 미구현"이라 명시했지만 시나리오 검증에서 LOT/입고관리 잔여수량이 +3 복구되는 동작 관찰됨. 정확한 출처 미파악. 코드 점검 + 문서 갱신 필요.
- **옛 이동 LOT 0180 (`recfFhdj2rVdHSgiR`) 품목 link/품목명 누락** — 신규 코드(f2f9974)는 fix지만 기존 LOT은 수동 정리 필요. 사용자 결정 사항.
- **운영 검증으로 생긴 테스트 LOT 정리 필요** — 0182~0188 LOT 7건 + 0183 출고건(recK4KpdNBItsqRi8, 의도 확인 필요) + 이동 반려 + 출고 반려로 데이터 흐름 복잡. 운영 사용 전 정리 (반려 또는 폐기) 권장.

**다음 작업 후보**
- 출고시점 판매금액 버그 fix (출고관리.판매금액 필드 추가 또는 코드를 `판매가 × 수량`으로 변경) — 손익 정확도 회복
- 재고 이동 반려 자동 복구 코드 점검 + 정합성 검증 + 문서 갱신
- 0180 + 운영 검증 테스트 LOT(0182~0188) 정리
- security.test.ts flaky 디버깅
- Phase 1 Step 1 — `BulkResultsPanel` 컴포넌트 추출

---

## 누적 통계 (2026-05-13 기준)

- 단위 테스트: 5 files / **105 pass** (+2 vs 5-06)
- 통합 테스트: 18 files / **68 pass** (+7 시나리오: cost-carryover)
- 신규 Airtable 필드: LOT.이동입고일, LOT.이월냉장료/이월입출고비/이월노조비/이월동결비, 출고관리.출고시점 동결비
- 필드명 변경: LOT.입고일자 → 최초입고일
- 신규 Airtable formula 갱신: LOT.판매원가, LOT.누적냉장료 (이동입고일 ?? 최초입고일 fallback + 이월 4개 합산)

## 누적 통계 (2026-05-06 기준)

- 70 커밋, 활동 8일
- 단위 테스트: 5 files / **103 pass**
- 통합 테스트: 12 files / **45 pass** (21개 시나리오)
- 신규 환경변수: ADMIN_SECRET, CRON_SECRET, RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_THRESHOLD, NEXT_PUBLIC_BASE_URL
- 신규 Airtable 필드: pin_hash, pin_fail_count, pin_locked_until (작업자 테이블)
- 신규 테이블: 재고 이동
