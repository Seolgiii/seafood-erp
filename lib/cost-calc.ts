// ─────────────────────────────────────────────────────────────────────────────
// 재고 차감·이동 시 비용/단가 계산 (순수 함수)
// admin.ts·transfer.ts에서 호출. Airtable I/O가 분리되어 있어 단위 테스트 용이.
// ─────────────────────────────────────────────────────────────────────────────

/** 출고 승인 시점에 출고 관리에 기록할 비용 항목 */
export type OutboundCostBreakdown = {
  /** 단가 = 수매가 ÷ 총중량 (원/kg) — 총중량 0이면 0 */
  unitCost: number;
  /** 냉장료 = 냉장료단가 × 보관일수 */
  refrigerationCost: number;
  /** 보관일수 (입고일~출고일, 음수는 0으로 클램프) */
  daysHeld: number;
  /** 입출고비 (LOT 저장값 그대로) */
  inOutFee: number;
  /** 노조비 (LOT 저장값 그대로) */
  unionFee: number;
  /** 동결비 (LOT 저장값 그대로) */
  freezeFee: number;
  /** 판매원가 = 단가 + 냉장료 + 입출고비 + 노조비 + 동결비 */
  totalCost: number;
  /** 손익 = 판매금액 − 판매원가 */
  profit: number;
};

export type OutboundCostInput = {
  /** LOT.수매가 (원) */
  purchasePrice: number;
  /** LOT.총중량 (kg) */
  totalWeight: number;
  /** LOT.냉장료단가 (원/일) */
  refrigerationFeePerUnit: number;
  /** LOT.입출고비 */
  inOutFee: number;
  /** LOT.노조비 */
  unionFee: number;
  /** LOT.동결비 */
  freezeFee: number;
  /** LOT.이월냉장료 (이전 보관처에서 비례 분할로 이월된 누적 냉장료) */
  carriedRefrigeration: number;
  /** LOT.이월입출고비 */
  carriedInOutFee: number;
  /** LOT.이월노조비 */
  carriedUnionFee: number;
  /** LOT.이월동결비 */
  carriedFreezeFee: number;
  /** 출고 관리.판매금액 */
  saleAmount: number;
  /** LOT.이동입고일 (YYYY-MM-DD) — 누적 냉장료 기준일 */
  inboundDate: string;
  /** 출고 관리.출고일 (YYYY-MM-DD) */
  outboundDate: string;
};

const MS_PER_DAY = 86_400_000;

/** 두 YYYY-MM-DD 사이 일수 (음수는 0으로 클램프, 형식 오류 시 0) */
export function daysBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / MS_PER_DAY));
}

/** 출고 승인 시점 비용/손익 계산 */
export function calculateOutboundCost(input: OutboundCostInput): OutboundCostBreakdown {
  const unitCost = input.totalWeight > 0 ? input.purchasePrice / input.totalWeight : 0;
  const daysHeld = daysBetween(input.inboundDate, input.outboundDate);
  const refrigerationCost = input.refrigerationFeePerUnit * daysHeld;
  const carried =
    input.carriedRefrigeration +
    input.carriedInOutFee +
    input.carriedUnionFee +
    input.carriedFreezeFee;
  const totalCost =
    unitCost +
    refrigerationCost +
    input.inOutFee +
    input.unionFee +
    input.freezeFee +
    carried;
  return {
    unitCost,
    refrigerationCost,
    daysHeld,
    inOutFee: input.inOutFee,
    unionFee: input.unionFee,
    freezeFee: input.freezeFee,
    totalCost,
    profit: input.saleAmount - totalCost,
  };
}

export type TransferPricingInput = {
  /** 원본 LOT.수매가 */
  purchasePrice: number;
  /** 원본 LOT.누적냉장료 (formula 결과 — 이동입고일 ~ 오늘) */
  refrigerationCostAccum: number;
  /** 원본 LOT.입출고비 */
  inOutFee: number;
  /** 원본 LOT.노조비 */
  unionFee: number;
  /** 원본 LOT.동결비 */
  freezeCost: number;
  /** 원본 LOT.이월냉장료 */
  carriedRefrigeration: number;
  /** 원본 LOT.이월입출고비 */
  carriedInOutFee: number;
  /** 원본 LOT.이월노조비 */
  carriedUnionFee: number;
  /** 원본 LOT.이월동결비 */
  carriedFreezeFee: number;
  /** 원본 LOT.재고수량 (박스) */
  currentStock: number;
  /** 이동 수량 (박스) */
  transferQty: number;
};

export type TransferPricing = {
  /** 새 LOT.수매가 = 원본 수매가 × 비율 (원본 단가만 이월, 비용은 이월 필드에 분해 저장) */
  newPurchasePrice: number;
  /** 새 LOT.이월냉장료 = (원본 누적냉장료 + 원본 이월냉장료) × 비율 */
  newCarriedRefrigeration: number;
  /** 새 LOT.이월입출고비 = (원본 입출고비 + 원본 이월입출고비) × 비율 */
  newCarriedInOutFee: number;
  /** 새 LOT.이월노조비 = (원본 노조비 + 원본 이월노조비) × 비율 */
  newCarriedUnionFee: number;
  /** 새 LOT.이월동결비 = (원본 동결비 + 원본 이월동결비) × 비율 */
  newCarriedFreezeFee: number;
};

/**
 * 재고 이동 시 새 LOT의 가격/이월 경비 산정 (옵션 B)
 *
 *   비율 = 이동수량 / 재고수량
 *   새 수매가          = round(원본 수매가 × 비율)
 *   새 이월냉장료      = round((원본 누적냉장료 + 원본 이월냉장료) × 비율)
 *   새 이월입출고비    = round((원본 입출고비 + 원본 이월입출고비) × 비율)
 *   새 이월노조비      = round((원본 노조비 + 원본 이월노조비) × 비율)
 *   새 이월동결비      = round((원본 동결비 + 원본 이월동결비) × 비율)
 *
 * 이렇게 분해 저장해 두면 새 LOT의 판매원가 formula에서
 *   단가 + (새 보관처 누적냉장료/입출고비/노조비/동결비) + (이월 4개)
 * 를 합산해 출고시점까지의 누적 비용을 정확히 계산할 수 있다.
 */
export function calculateTransferPricing(input: TransferPricingInput): TransferPricing {
  const ratio =
    input.currentStock > 0 ? input.transferQty / input.currentStock : 0;
  return {
    newPurchasePrice: Math.round(input.purchasePrice * ratio),
    newCarriedRefrigeration: Math.round(
      (input.refrigerationCostAccum + input.carriedRefrigeration) * ratio
    ),
    newCarriedInOutFee: Math.round(
      (input.inOutFee + input.carriedInOutFee) * ratio
    ),
    newCarriedUnionFee: Math.round(
      (input.unionFee + input.carriedUnionFee) * ratio
    ),
    newCarriedFreezeFee: Math.round(
      (input.freezeCost + input.carriedFreezeFee) * ratio
    ),
  };
}
