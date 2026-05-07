# F4 zod 모니터링 검증

## 트리거
Airtable 응답을 도메인 모듈에서 받을 때마다 (모든 데이터 흐름)

## 흐름
1. 도메인 모듈이 Airtable 어댑터 호출 → 응답 수신 → [[30_모듈별_상세/입력_Sanitize_Schema]]
2. 9개 zod 스키마 (worker/product/lot/inbound/outbound/expense/storage/supplier/transfer) 중 해당 스키마로 검증 → [[30_모듈별_상세/입력_Sanitize_Schema]]
3. 분기:
   - 검증 통과 → 흐름 그대로 진행
   - 검증 실패 → `[SCHEMA-MISMATCH]` prefix 로그만 남기고 흐름 차단 X (모니터링 모드)→ [[30_모듈별_상세/운영_로거]]
4. 운영자가 grep `[SCHEMA-MISMATCH]`로 누적 추적

## 모듈 간 데이터 흐름
- Airtable 어댑터 → [[30_모듈별_상세/입력_Sanitize_Schema]]: 응답 데이터
- (검증 실패 시) [[30_모듈별_상세/입력_Sanitize_Schema]] → [[30_모듈별_상세/운영_로거]]: SCHEMA-MISMATCH 로그

## 관련 결정사항
- [[40_결정기록/Airtable_zod_모니터링모드]]
- [[40_결정기록/INTEGRITY_ALERT_로그_규약]]

## 영향받는 코드 파일
- lib/schemas/worker.ts
- lib/schemas/product.ts
- lib/schemas/lot.ts
- lib/schemas/inbound.ts
- lib/schemas/outbound.ts
- lib/schemas/expense.ts
- lib/schemas/storage.ts
- lib/schemas/supplier.ts
- lib/schemas/transfer.ts
- lib/airtable-schema.ts

## 구현 상태
- 운영 중. 모니터링 모드 (운영 회귀 위험 0)
- 차단 모드 전환은 누적 SCHEMA-MISMATCH 분석 후 검토

## 관련 시나리오
- [[50_시나리오/B1_LOT_생성_시점_비용_적용]]
- [[50_시나리오/B2_출고시점_비용_스냅샷_손익]]
