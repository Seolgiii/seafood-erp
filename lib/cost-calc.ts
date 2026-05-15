// ─────────────────────────────────────────────────────────────────────────────
// 재고 차감·이동 시 비용/단가 계산 (순수 함수)
// admin.ts·transfer.ts에서 호출. Airtable I/O가 분리되어 있어 단위 테스트 용이.
//
// 단위 규약 (C안 + 동결비 특례):
//   박스당:  수매가, 입출고비, 노조비, 동결비, 냉장료단가, 박스당누적냉장료
//   총액(원): 이월냉장료, 이월입출고비, 이월노조비, 이월동결비
//   원/kg:   단가(출고시점 단가)
//   총액(원): 출고시점 냉장료/입출고비/노조비/동결비/판매원가/판매금액/손익
//
// 동결비 특례: 이동된 LOT의 동결비 = 0 (새 보관처에서 부과 X).
//              단, 이월동결비는 원본 LOT 동결비 cost basis를 박스당으로 보존.
// ─────────────────────────────────────────────────────────────────────────────

/** 출고 승인 시점에 출고 관리에 기록할 비용 항목 (모두 이 출고에서 발생한 총액 원, 단가만 원/kg) */
export type OutboundCostBreakdown = {
  /** 단가 (원/kg) = 박스당 수매가 / 박스당 무게 — 스냅샷·참조용 */
  unitCost: number;
  /** 이 출고의 냉장료 비용 (원, 총액) = (박스당 누적 × 출고박스) + (이월냉장료 × 출고박스/입고박스) */
  refrigerationCost: number;
  /** 보관일수 (입고일~출고일, 음수는 0으로 클램프) */
  daysHeld: number;
  /** 이 출고의 입출고비 (원, 총액) */
  inOutFee: number;
  /** 이 출고의 노조비 (원, 총액) */
  unionFee: number;
  /** 이 출고의 동결비 (원, 총액) — 이동된 LOT은 박스당=0, 이월동결비만 반영 */
  freezeFee: number;
  /** 이 출고의 판매원가 (원, 총액) = 매입원가 + 모든 비용 합 */
  totalCost: number;
  /** 손익 (원) = saleAmount − totalCost */
  profit: number;
};

export type OutboundCostInput = {
  /** LOT.수매가 (원/박스) — 박스당 매입가 */
  purchasePrice: number;
  /** LOT.총중량 (kg) = 규격 × 입고수량(BOX) */
  totalWeight: number;
  /** LOT.입고수량(BOX) — 박스당↔총액 환산 분모 */
  inboxQty: number;
  /** LOT.냉장료단가 (원/박스/일) */
  refrigerationFeePerUnit: number;
  /** LOT.입출고비 (원/박스) */
  inOutFee: number;
  /** LOT.노조비 (원/박스) */
  unionFee: number;
  /** LOT.동결비 (원/박스) — 이동된 LOT은 0 (동결비 특례) */
  freezeFee: number;
  /** LOT.이월냉장료 (원, 총액) */
  carriedRefrigeration: number;
  /** LOT.이월입출고비 (원, 총액) */
  carriedInOutFee: number;
  /** LOT.이월노조비 (원, 총액) */
  carriedUnionFee: number;
  /** LOT.이월동결비 (원, 총액) — 원본 동결비 cost basis 보존 */
  carriedFreezeFee: number;
  /** 출고 관리.판매금액 (원, 총액) = 판매가(박스당) × 출고박스수 */
  saleAmount: number;
  /** LOT.이동입고일 ?? LOT.최초입고일 (YYYY-MM-DD) */
  inboundDate: string;
  /** 출고 관리.출고일 (YYYY-MM-DD) */
  outboundDate: string;
  /** 출고 관리.출고수량 (박스) */
  outQty: number;
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

/**
 * 출고 승인 시점 비용/손익 계산.
 *
 * 모든 비용은 이 출고에서 발생한 총액(원) 기준.
 * - 박스당 비용 → × 출고박스수
 * - 이월 비용 (총액) → × 출고박스/입고박스 (비례 분할)
 * - 단가는 원/kg 스냅샷 (참조용)
 */
export function calculateOutboundCost(input: OutboundCostInput): OutboundCostBreakdown {
  const weightPerBox = input.inboxQty > 0 ? input.totalWeight / input.inboxQty : 0;
  const unitCost = weightPerBox > 0 ? input.purchasePrice / weightPerBox : 0;

  const daysHeld = daysBetween(input.inboundDate, input.outboundDate);
  const refrigerationPerBox = input.refrigerationFeePerUnit * daysHeld;

  const outRatio = input.inboxQty > 0 ? input.outQty / input.inboxQty : 0;

  const refrigerationCost =
    refrigerationPerBox * input.outQty + input.carriedRefrigeration * outRatio;
  const inOutFee = input.inOutFee * input.outQty + input.carriedInOutFee * outRatio;
  const unionFee = input.unionFee * input.outQty + input.carriedUnionFee * outRatio;
  const freezeFee = input.freezeFee * input.outQty + input.carriedFreezeFee * outRatio;

  const purchaseCost = input.purchasePrice * input.outQty;
  const totalCost = purchaseCost + refrigerationCost + inOutFee + unionFee + freezeFee;

  return {
    unitCost,
    refrigerationCost,
    daysHeld,
    inOutFee,
    unionFee,
    freezeFee,
    totalCost,
    profit: input.saleAmount - totalCost,
  };
}

export type TransferPricingInput = {
  /** 원본 LOT.수매가 (원/박스) */
  purchasePrice: number;
  /** 원본 LOT.누적냉장료 formula 결과 (원/박스, 이동입고일 ~ 오늘) */
  refrigerationCostAccum: number;
  /** 원본 LOT.입출고비 (원/박스) */
  inOutFee: number;
  /** 원본 LOT.노조비 (원/박스) */
  unionFee: number;
  /** 원본 LOT.동결비 (원/박스) — 원본 LOT은 실값, 이동된 LOT은 0 */
  freezeCost: number;
  /** 원본 LOT.이월냉장료 (원, 총액) */
  carriedRefrigeration: number;
  /** 원본 LOT.이월입출고비 (원, 총액) */
  carriedInOutFee: number;
  /** 원본 LOT.이월노조비 (원, 총액) */
  carriedUnionFee: number;
  /** 원본 LOT.이월동결비 (원, 총액) */
  carriedFreezeFee: number;
  /** 원본 LOT.입고수량(BOX) — 이월 박스당 환산 분모 */
  sourceInboxQty: number;
  /** 이동 수량 (박스) */
  transferQty: number;
};

export type TransferPricing = {
  /** 새 LOT.수매가 (원/박스) = 원본 박스당 그대로 (비례 분할 X) */
  newPurchasePrice: number;
  /** 새 LOT.이월냉장료 (원, 총액) = (원본 박스당 누적냉장료 + 원본 이월냉장료/입고박스수) × 이동박스수 */
  newCarriedRefrigeration: number;
  /** 새 LOT.이월입출고비 (원, 총액) */
  newCarriedInOutFee: number;
  /** 새 LOT.이월노조비 (원, 총액) */
  newCarriedUnionFee: number;
  /** 새 LOT.이월동결비 (원, 총액) — 원본 동결비 cost basis 박스당 단위로 보존 */
  newCarriedFreezeFee: number;
};

/**
 * 재고 이동 시 새 LOT의 가격/이월 경비 산정 (C안 + 동결비 특례).
 *
 *   박스당 누적 cost basis = (현재 보관처 박스당 비용) + (원본 이월 / 입고박스수)
 *   새 LOT.이월X = 박스당 누적 × 이동박스수 (총액)
 *
 *   새 LOT.수매가 = 원본 수매가 (박스당 그대로, 변경 X)
 *
 * 동결비 특례:
 *   - 새 LOT.동결비는 transfer.ts에서 0으로 설정 (calculateTransferPricing 외부)
 *   - 이 함수는 source LOT의 freezeCost를 받아 정상 처리:
 *     · source가 원본 LOT (이동 안 됨): freezeCost = 보관처 비용 → 박스당 cost basis로 보존
 *     · source가 이미 이동된 LOT: freezeCost = 0 → 이월동결비(총액)만 박스당 단위로 분할
 *   - 결과적으로 박스당 동결비 cost basis가 N단계 이동에도 일관 유지됨
 */
export function calculateTransferPricing(input: TransferPricingInput): TransferPricing {
  if (input.sourceInboxQty <= 0) {
    return {
      newPurchasePrice: input.purchasePrice,
      newCarriedRefrigeration: 0,
      newCarriedInOutFee: 0,
      newCarriedUnionFee: 0,
      newCarriedFreezeFee: 0,
    };
  }

  const carriedPerBox = {
    refrigeration: input.carriedRefrigeration / input.sourceInboxQty,
    inOutFee: input.carriedInOutFee / input.sourceInboxQty,
    unionFee: input.carriedUnionFee / input.sourceInboxQty,
    freezeFee: input.carriedFreezeFee / input.sourceInboxQty,
  };

  const totalPerBox = {
    refrigeration: input.refrigerationCostAccum + carriedPerBox.refrigeration,
    inOutFee: input.inOutFee + carriedPerBox.inOutFee,
    unionFee: input.unionFee + carriedPerBox.unionFee,
    freezeFee: input.freezeCost + carriedPerBox.freezeFee,
  };

  return {
    newPurchasePrice: input.purchasePrice,
    newCarriedRefrigeration: Math.round(totalPerBox.refrigeration * input.transferQty),
    newCarriedInOutFee: Math.round(totalPerBox.inOutFee * input.transferQty),
    newCarriedUnionFee: Math.round(totalPerBox.unionFee * input.transferQty),
    newCarriedFreezeFee: Math.round(totalPerBox.freezeFee * input.transferQty),
  };
}
