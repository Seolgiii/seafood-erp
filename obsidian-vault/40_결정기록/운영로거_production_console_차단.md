# 운영로거_production_console_차단

## 상태
✅ 확정

## 한 줄 요약
production console 노출 0 정책 — 모든 로그는 lib/logger 통과

## 결정 내용
4/28 console.log → lib/logger.ts 일괄 교체. production에서는 console 노출 차단, 운영자가 추적해야 할 정합성 위험은 [INTEGRITY-ALERT] / [SCHEMA-MISMATCH] prefix만 남김.

## 영향받는 모듈
- [[운영_로거]]

## 영향받는 시나리오
(직접 매핑되는 시나리오 없음 — 인프라 결정)
