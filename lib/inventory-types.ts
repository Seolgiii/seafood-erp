import type { StorageCost } from "@/lib/storage-cost";

/** Shared shape for LOT search cards (client + server). */
export type LotSearchCard = {
  recordId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  specDetail: string;
  /** 표시용: `11kg (42/44미)` */
  specDisplayLine: string;
  stockLine: string;
  pendingApproval: boolean;
  /** 박스 단위 재고수량 */
  stockQty: number | null;
  productRecordId: string | null;
  /** LOT의 보관처명 */
  storage: string;
  /** LOT의 입고일자 YYYY-MM-DD (이동입고일 우선, 없으면 최초입고일) */
  inboundDate: string;
  /** 입고일자 기준으로 조회된 보관처 요금 (없으면 null) */
  storageCost: StorageCost | null;
};
