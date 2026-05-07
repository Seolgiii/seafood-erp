# 입력_Sanitize_Schema

## 역할
입력 sanitize (제어문자 제거 + 필드별 길이 제한) + Airtable 응답 zod 스키마 검증 (모니터링 모드, [SCHEMA-MISMATCH] 로그)

## 코드 위치
- lib/input-sanitize.ts
- lib/input-sanitize.test.ts
- lib/schemas/ (worker/product/lot/inbound/outbound/expense/storage/supplier/transfer/common)

## 현재 상태
운영 중 (검증 실패 시 모니터링만, 차단 X)

## 관련 결정사항
- [[Airtable_zod_모니터링모드]]

## 의존 모듈
- [[운영_로거]]

## 등장하는 시나리오
- [[50_시나리오/A1_입고_골든패스]]
- [[50_시나리오/A2_출고_골든패스]]
- [[50_시나리오/A4_지출_결의_골든패스]]
- [[50_시나리오/A6_PIN_로그인_정상_흐름]]
- [[50_시나리오/B1_LOT_생성_시점_비용_적용]]
- [[50_시나리오/B2_출고시점_비용_스냅샷_손익]]
- [[50_시나리오/C2_PostgreSQL_이전_파급_영향]]
- [[50_시나리오/F4_zod_모니터링_검증]]
