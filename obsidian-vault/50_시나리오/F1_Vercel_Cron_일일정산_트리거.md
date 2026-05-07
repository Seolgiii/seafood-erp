# F1 Vercel Cron 일일정산 트리거

## 트리거
Vercel Cron Job — 매일 09:00 KST 발화 (vercel.json crons 설정)

## 흐름
1. Vercel 인프라가 09:00 KST에 `/api/cron/daily-report` GET 트리거
2. CRON_SECRET 헤더 검증 (외부 호출 차단) → [[30_모듈별_상세/서버_권한_검증]]
3. `lib/daily-report.ts` 진입 — 어제 데이터 집계 → [[30_모듈별_상세/일일_정산_이메일]]
4. HTML 본문 작성 + Resend 발송
5. 발화 결과 로그 (Vercel 로그에서 확인)

## 모듈 간 데이터 흐름
- Vercel Cron → API 라우트: HTTP GET + CRON_SECRET
- [[30_모듈별_상세/서버_권한_검증]] → [[30_모듈별_상세/일일_정산_이메일]]: 인증 통과 후 집계 호출

## 관련 결정사항
- [[40_결정기록/일일정산_cron_09KST]]
- [[40_결정기록/자체_도메인_구매]]

## 미해결 결정의 영향
- [[40_결정기록/자체_도메인_구매]]: deliverability에 영향 (Cron 자체는 정상 발화하나 메일 미도착 가능성)

## 영향받는 코드 파일
- vercel.json (crons)
- app/api/cron/daily-report/route.ts
- lib/daily-report.ts
- lib/resend.ts

## 구현 상태
- 운영 중. 5/7 발화 정상 확인 (00:27 UTC = 09:27 KST), Resend API 200 응답
- 사용자 미수신 원인 = 도메인 mismatch (Cron 자체 문제 아님)

## 관련 시나리오
- [[50_시나리오/E2_일일정산_이메일_A4_인쇄]]
- [[50_시나리오/C3_도메인_미구매_deliverability_제약]]
