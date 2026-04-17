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
  qtyBase: number | null;
  qtyDetail: number | null;
  baseUnitLabel: string;
  detailUnitLabel: string;
  /** `기준1당_상세수량`: detail units per 1 base unit */
  detailPerBase: number | null;
  productRecordId: string | null;
  /** LOT의 보관처명 */
  storage: string;
  /** LOT의 입고일자 YYYY-MM-DD */
  inboundDate: string;
  /** 입고일자 기준으로 조회된 보관처 요금 (없으면 null) */
  storageCost: StorageCost | null;
};

export type ShipmentInputMode = "base" | "detail";
