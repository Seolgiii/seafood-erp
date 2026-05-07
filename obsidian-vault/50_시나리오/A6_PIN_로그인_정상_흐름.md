# A6 PIN 로그인 정상 흐름

## 트리거
작업자가 로그인 화면에서 본인 카드 선택 → 4자리 PIN 입력

## 흐름
1. 작업자가 본인 작업자 카드 클릭 → PIN 키패드 노출 → [[30_모듈별_상세/PIN_인증]]
2. 4자리 PIN 입력 + sanitize (제어문자 제거) → [[30_모듈별_상세/입력_Sanitize_Schema]]
3. POST `/api/auth/pin` → [[30_모듈별_상세/PIN_인증]]
4. rate limit 체크 — Airtable의 `pin_locked_until` 조회 → 잠금 중이면 즉시 거부 → [[30_모듈별_상세/PIN_인증]]
5. PIN 매칭 시도 — `pin_hash` 우선 (scrypt) → 없으면 평문 PIN 매칭 → [[30_모듈별_상세/PIN_인증]]
6. **자동 마이그레이션** — 평문 PIN 매칭 성공 시 즉시 scrypt 해시화 + Airtable PATCH (pin_hash set, pin null) → [[30_모듈별_상세/PIN_인증]]
7. 성공 — `pin_fail_count` 0으로 초기화 + 세션 쿠키 set + 자동 로그아웃 타이머 시작 → [[30_모듈별_상세/세션_자동로그아웃]]
8. 실패 — `pin_fail_count++`, 5회 도달 시 `pin_locked_until` set
9. 서버 액션 호출 시 매번 작업자 role 재조회 → [[30_모듈별_상세/서버_권한_검증]]

## 모듈 간 데이터 흐름
- [[30_모듈별_상세/PIN_인증]] ↔ Airtable 작업자 테이블: pin_hash / pin / pin_fail_count / pin_locked_until 읽기·쓰기
- [[30_모듈별_상세/PIN_인증]] → [[30_모듈별_상세/세션_자동로그아웃]]: 세션 쿠키 + 만료 시각
- [[30_모듈별_상세/세션_자동로그아웃]] → [[30_모듈별_상세/서버_권한_검증]]: 작업자 ID → 매 요청 시 role 조회

## 관련 결정사항
- [[40_결정기록/PIN_scrypt_해시화]]
- [[40_결정기록/PIN_RateLimit_Airtable_영속화]]
- [[40_결정기록/서버_액션_권한_재검증]]
- [[40_결정기록/자동로그아웃_5분전_배너]]
- [[40_결정기록/기기별_고정_로그인]]
- [[40_결정기록/본인이름만_표시_로그인]]

## 미해결 결정의 영향
- [[40_결정기록/기기별_고정_로그인]]: 미정 — 현재 모든 작업자 카드가 모든 기기에 노출
- [[40_결정기록/본인이름만_표시_로그인]]: 미정 — 본인 이름만 노출하는 흐름 미도입

## 영향받는 코드 파일
- app/login/page.tsx
- app/api/auth/pin/route.ts
- lib/pin-hash.ts
- lib/pin-rate-limit.ts
- lib/pin-rate-limit-core.ts
- lib/server-auth.ts
- lib/session.ts
- components/WorkerPinLogin.tsx

## 구현 상태
- 운영 중. backward compatible 마이그레이션 — 평문 PIN 사용자도 첫 로그인 시 자동 해시화
- 단위 테스트 server-auth / pin-rate-limit-core 커버

## 관련 시나리오
- [[50_시나리오/A7_자동로그아웃_5분전_경고]]
- [[50_시나리오/D3_PIN_rate_limit_자동_잠금]]
