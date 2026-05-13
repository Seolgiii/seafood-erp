/**
 * LOT 재고수량 가감 (박스 단위 단일).
 *
 * 가공품(상세 단위)·수율 오차 분기는 2026-05-13 제거되었다.
 * 가공품 흐름이 다시 필요해지면 별도 모듈로 설계할 것.
 */

export function computeLotStockAfterOutbound(opts: {
  currentStock: number;
  requestedQty: number;
}): number {
  return Math.max(0, opts.currentStock - Math.max(0, opts.requestedQty));
}

export function computeLotStockAfterInbound(opts: {
  currentStock: number;
  receivedQty: number;
}): number {
  return opts.currentStock + Math.max(0, opts.receivedQty);
}
