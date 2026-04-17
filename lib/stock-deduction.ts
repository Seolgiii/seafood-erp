/**
 * Decrease LOT stock from an approved outbound line.
 * Yield variance is always applied in detail-unit space when dual-unit.
 */
export function computeLotStockAfterOutbound(opts: {
  qtyBase: number;
  qtyDetail: number;
  requestedQty: number;
  requestUnit: string;
  yieldVarianceDetail: number;
  productBaseUnit: string;
  productDetailUnit: string;
  detailPerBase: number | null;
}): { qtyBase: number; qtyDetail: number } {
  const B0 = opts.qtyBase;
  const D0 = opts.qtyDetail;
  const qty = Math.max(0, opts.requestedQty);
  const y = opts.yieldVarianceDetail || 0;
  const bu = opts.productBaseUnit.trim();
  const du = opts.productDetailUnit.trim();
  const u = opts.requestUnit.trim();
  const R =
    opts.detailPerBase != null && opts.detailPerBase > 0
      ? opts.detailPerBase
      : null;

  // PBO/가공품: 기준1당_상세수량이 있을 때만 상세 재고를 함께 계산한다.
  // 원물: 박스(기준단위)만 차감하고 미수(상세)는 차감 계산에 포함하지 않는다.
  if (R == null && bu.length > 0) {
    const baseRemoved = u === bu ? qty : 0;
    return { qtyBase: Math.max(0, B0 - baseRemoved), qtyDetail: D0 };
  }

  if (R != null && bu.length > 0 && du.length > 0) {
    let detailRemoved = 0;
    if (u === du) detailRemoved = qty + y;
    else if (u === bu) detailRemoved = qty * R + y;
    else detailRemoved = qty + y;

    const canonBefore = B0 * R + D0;
    const canon = Math.max(0, canonBefore - detailRemoved);
    const B1 = Math.floor(canon / R + 1e-9);
    const D1 = Math.round((canon - B1 * R) * 1000) / 1000;
    return { qtyBase: B1, qtyDetail: Math.max(0, D1) };
  }

  if (bu.length > 0 && du.length === 0) {
    if (u === bu) {
      return { qtyBase: Math.max(0, B0 - qty), qtyDetail: D0 };
    }
    return { qtyBase: Math.max(0, B0), qtyDetail: D0 };
  }

  if (du.length > 0 && bu.length === 0) {
    const dec = qty + y;
    return { qtyBase: B0, qtyDetail: Math.max(0, D0 - dec) };
  }

  return { qtyBase: Math.max(0, B0), qtyDetail: Math.max(0, D0) };
}

export function computeLotStockAfterInbound(opts: {
  qtyBase: number;
  qtyDetail: number;
  receivedQty: number;
  receiveUnit: string;
  productBaseUnit: string;
  productDetailUnit: string;
  detailPerBase: number | null;
}): { qtyBase: number; qtyDetail: number } {
  const B0 = opts.qtyBase;
  const D0 = opts.qtyDetail;
  const qty = Math.max(0, opts.receivedQty);
  const bu = opts.productBaseUnit.trim();
  const du = opts.productDetailUnit.trim();
  const u = opts.receiveUnit.trim();
  const R =
    opts.detailPerBase != null && opts.detailPerBase > 0
      ? opts.detailPerBase
      : null;

  // 원물: 박스(기준단위)만 입고로 늘린다. 상세는 참조용.
  if (R == null && bu.length > 0) {
    const baseAdded = u === bu ? qty : 0;
    return { qtyBase: B0 + baseAdded, qtyDetail: D0 };
  }

  // 가공품(PBO): 박스 입력 시 상세 수량도 함께 증가.
  if (R != null && bu.length > 0 && du.length > 0) {
    if (u === bu) {
      return { qtyBase: B0 + qty, qtyDetail: D0 + qty * R };
    }
    if (u === du) {
      // 상세단위로 직접 입고하는 경우도 허용
      const canonBefore = B0 * R + D0;
      const canon = canonBefore + qty;
      const B1 = Math.floor(canon / R + 1e-9);
      const D1 = Math.round((canon - B1 * R) * 1000) / 1000;
      return { qtyBase: B1, qtyDetail: Math.max(0, D1) };
    }
    return { qtyBase: B0, qtyDetail: D0 };
  }

  // 단일 단위 fallback
  if (bu.length > 0 && u === bu) return { qtyBase: B0 + qty, qtyDetail: D0 };
  if (du.length > 0 && u === du) return { qtyBase: B0, qtyDetail: D0 + qty };
  return { qtyBase: B0, qtyDetail: D0 };
}
