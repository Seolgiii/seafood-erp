# 일일보고서_CTA링크_제거

## 상태
✅ 확정

## 한 줄 요약
5/7 임시 fix — 발신 도메인(onboarding@resend.dev)과 본문 링크 도메인(seafood-erp.vercel.app) mismatch로 spam 트리거되어 CTA 링크 제거

## 결정 내용
이상적 fix는 자체 도메인 인증 후 발신/링크 도메인 통일이지만 현재 구매 계획 없음. 자체 도메인 구매 전까지 유지. commit 44aac2c.

## 영향받는 모듈
- [[일일_정산_이메일]]

## 영향받는 시나리오
- [[50_시나리오/C3_도메인_미구매_deliverability_제약]]
- [[50_시나리오/E2_일일정산_이메일_A4_인쇄]]
