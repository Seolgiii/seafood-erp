# Airtable_zod_모니터링모드

## 상태
✅ 확정

## 한 줄 요약
Airtable 응답을 zod 스키마로 검증하되, 실패해도 흐름은 그대로 진행 (모니터링 모드)

## 결정 내용
9개 스키마(worker/product/lot/inbound/outbound/expense/storage/supplier/transfer) 작성. 검증 실패 시 [SCHEMA-MISMATCH] 로그만 남기고 흐름 차단하지 않음. 운영 회귀 위험 0 우선.

## 영향받는 모듈
- [[입력_Sanitize_Schema]]

## 영향받는 시나리오
- [[50_시나리오/B1_LOT_생성_시점_비용_적용]]
- [[50_시나리오/B2_출고시점_비용_스냅샷_손익]]
- [[50_시나리오/F4_zod_모니터링_검증]]
