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
  /** 판매원가 = 단가 + 냉장료 + 입출고비 + 노조비 */
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
  /** 출고 관리.판매금액 */
  saleAmount: number;
  /** LOT.입고일자 (YYYY-MM-DD) */
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
  const totalCost = unitCost + refrigerationCost + input.inOutFee + input.unionFee;
  return {
    unitCost,
    refrigerationCost,
    daysHeld,
    inOutFee: input.inOutFee,
    unionFee: input.unionFee,
    totalCost,
    profit: input.saleAmount - totalCost,
  };
}

export type TransferPricingInput = {
  /** 원본 LOT.수매가 */
  purchasePrice: number;
  /** 원본 LOT.누적냉장료 */
  refrigerationCostAccum: number;
  /** 원본 LOT.입출고비 */
  inOutFee: number;
  /** 원본 LOT.노조비 */
  unionFee: number;
  /** 원본 LOT.동결비 */
  freezeCost: number;
  /** 원본 LOT.재고수량 (박스) */
  currentStock: number;
  /** 이동 수량 (박스) */
  transferQty: number;
};

/**
 * 재고 이동 시 새 LOT의 수매가 산정
 *   판매원가 = 수매가 + 누적냉장료 + 입출고비 + 노조비 + 동결비
 *   비율    = 이동수량 / 재고수량
 *   새 수매가 = round(판매원가 × 비율)
 */
export function calculateTransferPurchasePrice(input: TransferPricingInput): number {
  const totalCost =
    input.purchasePrice +
    input.refrigerationCostAccum +
    input.inOutFee +
    input.unionFee +
    input.freezeCost;
  const ratio = input.currentStock > 0 ? input.transferQty / input.currentStock : 0;
  return Math.round(totalCost * ratio);
}
