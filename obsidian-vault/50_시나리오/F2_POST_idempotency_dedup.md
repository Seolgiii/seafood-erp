# F2 POST idempotency dedup

## 트리거
입고/출고/재고이동/지출/결재 POST 요청 (사용자 재시도 또는 이중 클릭)

## 흐름
1. 클라이언트가 X-Idempotency-Key 헤더 생성 (UUID 또는 결정적 키) → [[30_모듈별_상세/POST_Idempotency]]
2. POST 라우트 진입 시 — 메모리 캐시에서 키 조회 → [[30_모듈별_상세/POST_Idempotency]]
3. 분기:
   - 캐시 미스 → 정상 처리 → 응답을 메모리에 5분 저장 → [[30_모듈별_상세/입고_관리]] / [[30_모듈별_상세/출고_관리]] / [[30_모듈별_상세/재고_이동]] / [[30_모듈별_상세/지출결의]]
   - 캐시 히트 → 캐시된 응답 즉시 반환 (실제 처리 X)
4. cold start 시 메모리 초기화 — 한계 (Vercel KV 도입 시 100% 보호)

## 모듈 간 데이터 흐름
- 클라이언트 → [[30_모듈별_상세/POST_Idempotency]]: X-Idempotency-Key 헤더
- [[30_모듈별_상세/POST_Idempotency]] → 처리 모듈: 캐시 미스 시 통과
- 처리 모듈 응답 → [[30_모듈별_상세/POST_Idempotency]]: 5분 메모리 저장

## 관련 결정사항
- [[40_결정기록/POST_Idempotency]]
- [[40_결정기록/입고_승인_멱등_가드_추가]]
- [[40_결정기록/출고_승인_멱등_가드]]

## 미해결 결정의 영향
- [[40_결정기록/입고_승인_멱등_가드_추가]]: 미구현 — cold start 시 메모리 초기화로 LOT 중복 생성 위험. 출고는 판매원가>0 가드로 차단되지만 입고는 메모리만 의존

## 영향받는 코드 파일
- lib/idempotency.ts
- app/api/inbound-create/route.ts
- app/api/inbound-receive/route.ts
- app/api/outbound-request/route.ts
- app/api/outbound-complete/route.ts
- app/api/expense/route.ts

## 구현 상태
- 운영 중. 통합 테스트 Idempotency 시나리오 통과
- Vercel KV 도입은 외부 의존성 추가로 신중

## 관련 시나리오
- [[50_시나리오/A1_입고_골든패스]]
- [[50_시나리오/A2_출고_골든패스]]
- [[50_시나리오/A3_재고이동_보관처_변경]]
- [[50_시나리오/A4_지출_결의_골든패스]]
