# LOT 관리 의존성 지도

> [[LOT별_재고]]는 ERP의 핵심 데이터 단위. 거의 모든 비즈니스 로직이 LOT을 거침.
> 마지막 갱신: 2026-05-08

## LOT을 거치는 모든 흐름

```mermaid
graph TD
    LOT[LOT별_재고]

    subgraph "생성 시점"
        입고1[입고 승인] --> LOT
        이동1[재고이동 승인] --> LOT
    end

    subgraph "조회 시점"
        조회[재고_조회] --> LOT
    end

    subgraph "차감 시점"
        출고2[출고 승인] --> LOT
        이동2[재고이동 시 원본] --> LOT
    end

    subgraph "비용 적용"
        LOT --> 비용1[보관처_비용_이력 lookup]
        LOT --> 비용2[3필드 set: 냉장료/입출고비/노조비]
    end

    subgraph "QR 식별자 통일안"
        LOT --> QR[QR 평생 식별자]
        QR -.-> PDF1[입고증 PDF]
        QR -.-> PDF2[출고증 PDF]
        QR -.-> 랜딩[/lot/식별자 랜딩 페이지/]
    end

    style LOT fill:#ffd700
    style QR fill:#90ee90
```

## 미해결 결정과의 관계

```mermaid
graph LR
    LOT[LOT별_재고]

    LOT -.-> Q1{FIFO 평단가<br/>정의 미정}
    LOT -.-> Q2{LOT 동시성<br/>100% 미정}
    LOT -.-> Q3{PostgreSQL<br/>이전 시점}

    Q1 --> 영향1[출고 비용 계산 분기]
    Q2 --> 영향2[1ms race window]
    Q3 --> 영향3[Airtable 한계]

    style Q1 fill:#ff6b6b,color:#fff
    style Q2 fill:#ff6b6b,color:#fff
    style Q3 fill:#ff6b6b,color:#fff
```

## 관련 노트

**모듈**:
- [[LOT별_재고]] (중심)
- [[입고_관리]] / [[출고_관리]] / [[재고_이동]] / [[재고_조회]]
- [[보관처_비용_이력]]
- [[PDF_생성]] / [[QR_스캔]]

**확정 결정**:
- [[QR_LOT_식별자_통합]]

**미해결 결정**:
- [[FIFO_평단가_시스템]]
- [[LOT동시성_100%_분산락]]
- [[PostgreSQL_이전_시점]]

**시나리오**:
- [[B1_LOT_생성_시점_비용_적용]]
- [[B2_출고시점_비용_스냅샷_손익]]
- [[B3_LOT_일련번호_낙관적_재시도]]
- [[E1_LOT_QR_평생_식별자]]
