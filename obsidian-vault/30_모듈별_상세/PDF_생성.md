# PDF_생성

## 역할
입고증/출고증/지출결의서 PDF 자동 생성 (한글 폰트 임베드). 출고증에는 LOT 조회용 QR 포함

## 코드 위치
- lib/generate-pdf.server.tsx
- components/PDFButton.tsx
- components/ExpensePDF.tsx
- scripts/generate-font-base64.mjs

## 현재 상태
운영 중

## 관련 결정사항
- [[QR_스캔_재고조회_전용]]
- [[QR_스캔_라우팅_변경_검토]]

## 의존 모듈
- [[입고_관리]]
- [[출고_관리]]
- [[지출결의]]
- [[LOT별_재고]]
- [[QR_스캔]]

## 등장하는 시나리오
- [[50_시나리오/A1_입고_골든패스]]
- [[50_시나리오/A2_출고_골든패스]]
- [[50_시나리오/A4_지출_결의_골든패스]]
- [[50_시나리오/E1_LOT_QR_평생_식별자]]
