# D3 PIN rate limit 자동 잠금

## 트리거
PIN 로그인 실패 누적 (악의적 brute force 또는 단순 오타)

## 흐름
1. PIN 입력 + 검증 실패 → `pin_fail_count++` (Airtable PATCH) → [[30_모듈별_상세/PIN_인증]]
2. 5회 도달 — `pin_locked_until` = now + 5분 set → [[30_모듈별_상세/PIN_인증]]
3. 잠금 중 PIN 시도 — 즉시 거부 (검증 X) → [[30_모듈별_상세/PIN_인증]]
4. 5분 경과 후 다시 5회 실패 — `pin_locked_until` = now + 30분 (escalation) → [[30_모듈별_상세/PIN_인증]]
5. 운영 추적용 로그 (실패 패턴) → [[30_모듈별_상세/운영_로거]]

## 모듈 간 데이터 흐름
- [[30_모듈별_상세/PIN_인증]] ↔ Airtable 작업자 테이블: pin_fail_count / pin_locked_until 영속화
- [[30_모듈별_상세/PIN_인증]] → [[30_모듈별_상세/운영_로거]]: 실패/잠금 로그

## 관련 결정사항
- [[40_결정기록/PIN_RateLimit_Airtable_영속화]]

## 영향받는 코드 파일
- lib/pin-rate-limit.ts
- lib/pin-rate-limit-core.ts
- lib/pin-rate-limit.test.ts
- app/api/auth/pin/route.ts

## 구현 상태
- 운영 중. Airtable 영속화로 분산 환경 정확
- 단위 테스트 pin-rate-limit-core 커버

## 관련 시나리오
- [[50_시나리오/A6_PIN_로그인_정상_흐름]]
