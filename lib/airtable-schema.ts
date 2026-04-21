/**
 * 베이스의 테이블·필드 이름과 1:1로 맞춤 (Airtable UI 표기와 동일).
 * 테이블명은 .env.local 의 AIRTABLE_WORKERS_TABLE 등으로 덮어쓸 수 있음.
 */
export const AIRTABLE_TABLE = {
  workers: "작업자",
  products: "품목마스터",
  lots: "LOT별 재고",
  txn: "입출고 내역",
  storageCostHistory: "보관처 비용 이력",
} as const;

/** 작업자 테이블 필드 */
export const WORKER_FIELDS = {
  name: "작업자명",
  pin: "PIN",
  active: "활성",
  role: "권한",
} as const;

/** LOT별 재고 테이블 필드 */
export const LOT_FIELDS = {
  lotNumber: "LOT번호",
  /** 품목 마스터로 연결되는 링크 필드 */
  productLink: "품목",
  /** LOT에 직접 저장/룩업된 규격 필드(베이스별 실제 이름과 일치 필요) */
  spec: "규격표시",
  detailSpec: "상세규격_표기",
  qtyBase: "기준단위_재고",
  qtyDetail: "상세단위_재고",
  /** LOT에 텍스트로 계산/룩업된 현재고(옵션) */
  stockText: "현재고",
  approvalStatus: "승인상태",
  /** 입고 시 선택 입력 (Airtable에 동일 필드명 필요) */
  purchasePrice: "수매가",
  /** kg·박스 등 단가(원). 없으면 UI에서 수매가÷총중량 등으로 계산 가능 */
  unitPrice: "단가",
  memo: "비고",
  /** 보관처명 — 보관처 비용 이력 테이블과 조인 키 */
  storage: "보관처",
  /** 입고일자 YYYY-MM-DD — 비용 이력 적용 기준 */
  inboundDate: "입고일자",
  /** 입고 승인 시 보관처 비용 이력에서 읽어 저장하는 냉장료 단가 */
  refrigerationFeePerUnit: "냉장료단가",
  /** 출고시점 단가 계산용 총중량 */
  totalWeight: "총중량",
  /** LOT에 저장/룩업된 입출고비 단가 */
  inOutFeeStored: "입출고비",
  /** LOT에 저장/룩업된 노조비 단가 */
  unionFeeStored: "노조비",
  /** 판매 원가 */
  salePrice: "판매원가",
} as const;

/** 품목 마스터 테이블 필드 */
export const PRODUCT_FIELDS = {
  name: "품목명",
  /** 원물/가공품 등 품목 구분 (선택) */
  category: "품목 구분",
  spec: "규격표시",
  detailSpec: "상세규격_표기",
  baseUnit: "기준단위_라벨",
  detailUnit: "상세단위_라벨",
  detailPerBase: "기준1당_상세수량",
} as const;

/** 보관처 비용 이력 테이블 필드 */
export const STORAGE_COST_FIELDS = {
  /** 보관처명 (텍스트 또는 링크 룩업) */
  storage: "보관처명",
  startDate: "적용시작일",
  endDate: "적용종료일",
  refrigerationFee: "냉장료",
  inOutFee: "입출고비",
  unionFee: "노조비",
} as const;

/** 승인상태 필드값 — 이 문구일 때 화면에 승인 대기 표시 */
export const LOT_PENDING_APPROVAL_EXACT = "승인 대기 중";
