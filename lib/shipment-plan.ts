import type { LotSearchCard, ShipmentInputMode } from "@/lib/inventory-types";

const EPS = 1e-6;

export type QuickAddPreset = { delta: number; label: string };

export function canonicalDetailTotal(card: LotSearchCard): number {
  const B = card.qtyBase ?? 0;
  const D = card.qtyDetail ?? 0;
  const r = card.detailPerBase;
  if (r != null && r > 0 && Number.isFinite(r)) {
    return B * r + D;
  }
  if (card.detailUnitLabel.trim()) return D > 0 ? D : B;
  if (card.baseUnitLabel.trim()) return B;
  return D || B || 0;
}

export function defaultInputMode(card: LotSearchCard): ShipmentInputMode {
  const r = card.detailPerBase;
  const hasDual =
    r != null &&
    r > 0 &&
    card.baseUnitLabel.trim().length > 0 &&
    card.detailUnitLabel.trim().length > 0;

  if (hasDual) {
    return "detail";
  }
  // Raw materials are box-driven unless a conversion ratio exists.
  if (card.baseUnitLabel.trim()) {
    return "base";
  }
  return "detail";
}

export function quickAddPresets(
  mode: ShipmentInputMode,
  card: LotSearchCard
): QuickAddPreset[] {
  const baseL = card.baseUnitLabel.trim() || "\uBC15\uC2A4";
  const detL = card.detailUnitLabel.trim() || "\uAC1C";

  if (mode === "base") {
    return [
      { delta: 10, label: `10${baseL}` },
      { delta: 100, label: `100${baseL}` },
    ];
  }

  const d = detL.toLowerCase();
  const isKg = d.includes("kg");
  if (isKg) {
    return [
      { delta: 10, label: `10${detL}` },
      { delta: 100, label: `100${detL}` },
    ];
  }
  return [
    { delta: 10, label: `10${detL}` },
    { delta: 100, label: `100${detL}` },
  ];
}

export function inputQtyToDetail(
  qty: number,
  mode: ShipmentInputMode,
  card: LotSearchCard
): number {
  const r = card.detailPerBase;
  if (mode === "base" && r != null && r > 0) return qty * r;
  return qty;
}

export function detailToInputQty(
  detailQty: number,
  mode: ShipmentInputMode,
  card: LotSearchCard
): number {
  const r = card.detailPerBase;
  if (mode === "base" && r != null && r > 0) return detailQty / r;
  return detailQty;
}

export type OutboundPlan = {
  qtyInInputUnit: number;
  unitLabel: string;
  mode: ShipmentInputMode;
  detailOut: number;
  yieldVarianceDetail: number;
  canonicalBefore: number;
  fullyDepleted: boolean;
};

function roundDisplayQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n - Math.round(n)) < 1e-5) return Math.round(n);
  return Math.round(n * 1000) / 1000;
}

export function planOutboundRequest(
  qtyInputRaw: number,
  mode: ShipmentInputMode,
  card: LotSearchCard
): OutboundPlan {
  const unitLabel =
    mode === "base"
      ? card.baseUnitLabel.trim()
      : card.detailUnitLabel.trim();

  const A = canonicalDetailTotal(card);
  const r = card.detailPerBase;
  const dual =
    r != null && r > 0 && Boolean(card.baseUnitLabel) && Boolean(card.detailUnitLabel);

  let qtyInput = Math.max(0, qtyInputRaw);
  let rawDetail = inputQtyToDetail(qtyInput, mode, card);

  if (!Number.isFinite(rawDetail)) rawDetail = 0;

  if (!Number.isFinite(A)) {
    return {
      qtyInInputUnit: roundDisplayQty(qtyInput),
      unitLabel,
      mode,
      detailOut: rawDetail,
      yieldVarianceDetail: 0,
      canonicalBefore: 0,
      fullyDepleted: false,
    };
  }

  const over = rawDetail > A + EPS;
  const wantsFull = rawDetail >= A - EPS && A > 0;

  let detailOut = Math.min(rawDetail, A);
  let yieldVarianceDetail = 0;

  if (dual && wantsFull) {
    detailOut = A;
    yieldVarianceDetail = roundDisplayQty(A - rawDetail);
    qtyInput = detailToInputQty(detailOut, mode, card);
  } else if (over) {
    detailOut = A;
    yieldVarianceDetail = 0;
    qtyInput = detailToInputQty(detailOut, mode, card);
  }

  return {
    qtyInInputUnit: roundDisplayQty(qtyInput),
    unitLabel,
    mode,
    detailOut: roundDisplayQty(detailOut),
    yieldVarianceDetail,
    canonicalBefore: roundDisplayQty(A),
    fullyDepleted: Boolean(dual) && A > 0 && detailOut >= A - EPS,
  };
}
