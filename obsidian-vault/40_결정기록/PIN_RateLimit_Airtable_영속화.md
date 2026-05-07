# PIN_RateLimit_Airtable_영속화

## 상태
✅ 확정

## 한 줄 요약
PIN rate limit을 Airtable(pin_fail_count / pin_locked_until)에 영속화

## 결정 내용
5회 실패 → 5분 잠금, 다시 5회 → 30분 escalation. 인-메모리 한계(인스턴스 분리 시 우회 가능)를 Airtable 영속화로 해결. 분산 환경에서도 정확.

## 영향받는 모듈
- [[PIN_인증]]

## 영향받는 시나리오
- [[50_시나리오/A6_PIN_로그인_정상_흐름]]
- [[50_시나리오/D3_PIN_rate_limit_자동_잠금]]
