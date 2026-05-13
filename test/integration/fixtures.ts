import type { AirtableRecord } from "./airtable-store";

/**
 * 통합 테스트 표준 fixture 데이터
 *
 * 각 테스트가 필요한 만큼 store.seed()로 주입합니다.
 * record id는 고정값을 사용해 테스트에서 직접 참조 가능.
 */

// 작업자 — ADMIN/MASTER/WORKER 1명씩
export const WORKER_ADMIN: AirtableRecord = {
  id: "recWORKERADMIN001",
  fields: {
    작업자명: "관리자A",
    PIN: "1111",
    활성: 1,
    권한: "ADMIN",
  },
};

export const WORKER_MASTER: AirtableRecord = {
  id: "recWORKERMASTER01",
  fields: {
    작업자명: "마스터B",
    PIN: "2222",
    활성: 1,
    권한: "MASTER",
  },
};

export const WORKER_NORMAL: AirtableRecord = {
  id: "recWORKERNORMAL01",
  fields: {
    작업자명: "직원C",
    PIN: "3333",
    활성: 1,
    권한: "WORKER",
  },
};

export const WORKER_INACTIVE: AirtableRecord = {
  id: "recWORKERINACTIV1",
  fields: {
    작업자명: "퇴직자D",
    PIN: "4444",
    활성: 0,
    권한: "WORKER",
  },
};

// 품목마스터
export const PRODUCT_MACKEREL: AirtableRecord = {
  id: "recPRODUCTMACKER1",
  fields: {
    품목명: "고등어",
    품목코드: "MC1",
    품목구분: "원물",
    규격표시: "11kg",
    상세규격_표기: "26미",
    기준단위_라벨: "박스",
  },
};

// 보관처 마스터
export const STORAGE_HANRIM: AirtableRecord = {
  id: "recSTORAGEHANRIM1",
  fields: { 보관처명: "한림냉동" },
};

export const STORAGE_BUSAN: AirtableRecord = {
  id: "recSTORAGEBUSAN01",
  fields: { 보관처명: "부산냉동" },
};

export const STORAGE_COST_BUSAN: AirtableRecord = {
  id: "recSTORAGECOSTBS1",
  fields: {
    보관처명: "부산냉동",
    적용시작일: "2026-01-01",
    적용종료일: "",
    냉장료: 1700,
    입출고비: 600,
    노조비: 250,
    동결비: 350,
  },
};

// 보관처 비용 이력 — 한림냉동, 2026-01-01 ~ 무제한
export const STORAGE_COST_HANRIM: AirtableRecord = {
  id: "recSTORAGECOSTHR1",
  fields: {
    보관처명: "한림냉동",
    적용시작일: "2026-01-01",
    적용종료일: "",
    냉장료: 1500,
    입출고비: 500,
    노조비: 200,
    동결비: 300,
  },
};

/** 자주 쓰는 묶음 — 모든 마스터 데이터 한 번에 seed */
export const ALL_MASTERS = {
  workers: [WORKER_ADMIN, WORKER_MASTER, WORKER_NORMAL, WORKER_INACTIVE],
  products: [PRODUCT_MACKEREL],
  storages: [STORAGE_HANRIM, STORAGE_BUSAN],
  storageCosts: [STORAGE_COST_HANRIM, STORAGE_COST_BUSAN],
};

/** 출고/이동 테스트용 — 이미 입고 승인된 상태의 입고 관리 레코드 */
export function makeApprovedInboundRecord(opts: {
  id?: string;
  lotNumber: string;
  qty: number;
  remaining?: number;
  storageId?: string;
  productId?: string;
  workerId?: string;
  purchasePrice?: number;
  inboundDate?: string;
}): AirtableRecord {
  return {
    id: opts.id ?? "recINBOUNDAPPROVED",
    fields: {
      LOT번호: opts.lotNumber,
      입고일: opts.inboundDate ?? "2026-04-15",
      입고수량: opts.qty,
      잔여수량: opts.remaining ?? opts.qty,
      수매가: opts.purchasePrice ?? 50000,
      미수: "26",
      규격: "11",
      원산지: "국내산",
      품목마스터: opts.productId ? [opts.productId] : [PRODUCT_MACKEREL.id],
      보관처: opts.storageId ? [opts.storageId] : [STORAGE_HANRIM.id],
      작업자: opts.workerId ? [opts.workerId] : [WORKER_NORMAL.id],
      매입자: opts.workerId ? [opts.workerId] : [WORKER_NORMAL.id],
      승인상태: "승인 완료",
    },
  };
}

/** 출고/이동 테스트용 — 재고가 채워진 LOT별 재고 레코드 */
export function makeInStockLot(opts: {
  id?: string;
  lotNumber: string;
  stockQty: number;
  inboundRecordId: string;
  storageId?: string;
  productId?: string;
  purchasePrice?: number;
  inboundDate?: string;          // 최초입고일 (default: 2026-04-15)
  transferInboundDate?: string;  // 이동입고일 (default: 최초입고일과 동일)
  refrigerationFeePerUnit?: number;
  inOutFee?: number;
  unionFee?: number;
  freezeFee?: number;
  carriedRefrigeration?: number;
  carriedInOutFee?: number;
  carriedUnionFee?: number;
  carriedFreezeFee?: number;
}): AirtableRecord {
  const firstInbound = opts.inboundDate ?? "2026-04-15";
  const fields: Record<string, unknown> = {
    LOT번호: opts.lotNumber,
    품목: opts.productId ? [opts.productId] : [PRODUCT_MACKEREL.id],
    재고수량: opts.stockQty,
    "입고수량(BOX)": opts.stockQty,
    수매가: opts.purchasePrice ?? 50000,
    총중량: opts.stockQty * 11, // 11kg/박스 기준
    최초입고일: firstInbound,
    보관처: opts.storageId ? [opts.storageId] : [STORAGE_HANRIM.id],
    입고관리링크: [opts.inboundRecordId],
    품목명: PRODUCT_MACKEREL.fields.품목명,
    규격: "11",
    미수: "26",
    냉장료단가: opts.refrigerationFeePerUnit ?? 1500,
    입출고비: opts.inOutFee ?? 500,
    노조비: opts.unionFee ?? 200,
    동결비: opts.freezeFee ?? 300,
    이월냉장료: opts.carriedRefrigeration ?? 0,
    이월입출고비: opts.carriedInOutFee ?? 0,
    이월노조비: opts.carriedUnionFee ?? 0,
    이월동결비: opts.carriedFreezeFee ?? 0,
  };
  // 이동입고일은 명시된 경우에만 채움 (이동 안 된 LOT은 null)
  if (opts.transferInboundDate) {
    fields.이동입고일 = opts.transferInboundDate;
  }
  return {
    id: opts.id ?? "recLOTINSTOCK001",
    fields,
  };
}
