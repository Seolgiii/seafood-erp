import type { LotSearchCard } from "@/lib/inventory-types";

const EPS = 1e-6;

export type QuickAddPreset = { delta: number; label: string };

export function maxOutboundQty(card: LotSearchCard): number {
  return card.stockQty ?? 0;
}

export function quickAddPresets(): QuickAddPreset[] {
  return [
    { delta: 10, label: "10박스" },
    { delta: 100, label: "100박스" },
  ];
}

export type OutboundPlan = {
  qtyInInputUnit: number;
  unitLabel: string;
  fullyDepleted: boolean;
};

function roundDisplayQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n - Math.round(n)) < 1e-5) return Math.round(n);
  return Math.round(n * 1000) / 1000;
}

export function planOutboundRequest(
  qtyInputRaw: number,
  card: LotSearchCard
): OutboundPlan {
  const max = maxOutboundQty(card);
  let qtyInput = Math.max(0, qtyInputRaw);
  if (qtyInput > max + EPS) qtyInput = max;

  return {
    qtyInInputUnit: roundDisplayQty(qtyInput),
    unitLabel: "박스",
    fullyDepleted: max > 0 && qtyInput >= max - EPS,
  };
}
