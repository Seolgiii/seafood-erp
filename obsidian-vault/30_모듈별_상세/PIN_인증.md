# PIN_인증

## 역할
작업자 4자리 PIN 로그인 + scrypt 해시화 + rate limit (5회→5분, 다시 5회→30분, Airtable 영속화). 평문 → 해시 자동 점진 마이그레이션

## 코드 위치
- lib/pin-hash.ts
- lib/pin-rate-limit.ts (Airtable 어댑터)
- lib/pin-rate-limit-core.ts (순수 로직)
- lib/pin-rate-limit.test.ts
- app/api/auth/pin/route.ts
- components/WorkerPinLogin.tsx

## 현재 상태
운영 중

## 관련 결정사항
- [[PIN_scrypt_해시화]]
- [[PIN_RateLimit_Airtable_영속화]]
- [[기기별_고정_로그인]]
- [[본인이름만_표시_로그인]]

## 의존 모듈
- [[서버_권한_검증]]
- [[입력_Sanitize_Schema]]
- [[운영_로거]]

## 등장하는 시나리오
- [[50_시나리오/A6_PIN_로그인_정상_흐름]]
- [[50_시나리오/A7_자동로그아웃_5분전_경고]]
- [[50_시나리오/D3_PIN_rate_limit_자동_잠금]]
