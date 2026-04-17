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
};

export type ShipmentInputMode = "base" | "detail";
