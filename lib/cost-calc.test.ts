import { describe, expect, test } from "vitest";
import {
  calculateOutboundCost,
  calculateTransferPricing,
  daysBetween,
} from "./cost-calc";

describe("daysBetween", () => {
  test("같은 날 → 0일", () => {
    expect(daysBetween("2026-04-10", "2026-04-10")).toBe(0);
  });

  test("정상 케이스 — 출고일이 입고일보다 뒤", () => {
    expect(daysBetween("2026-04-10", "2026-04-15")).toBe(5);
    expect(daysBetween("2026-04-01", "2026-05-01")).toBe(30);
  });

  test("출고일이 입고일보다 앞 → 0으로 클램프 (음수 방지)", () => {
    expect(daysBetween("2026-04-15", "2026-04-10")).toBe(0);
  });

  test("빈 문자열 → 0", () => {
    expect(daysBetween("", "2026-04-15")).toBe(0);
    expect(daysBetween("2026-04-10", "")).toBe(0);
  });

  test("형식 오류 → 0", () => {
    expect(daysBetween("invalid", "2026-04-15")).toBe(0);
    expect(daysBetween("2026-04-10", "not-a-date")).toBe(0);
  });
});

describe("calculateOutboundCost", () => {
  const baseInput = {
    purchasePrice: 1_000_000,    // 100만원
    totalWeight: 1000,            // 1000kg
    refrigerationFeePerUnit: 50, // 50원/일
    inOutFee: 10_000,
    unionFee: 5_000,
    freezeFee: 0,
    carriedRefrigeration: 0,
    carriedInOutFee: 0,
    carriedUnionFee: 0,
    carriedFreezeFee: 0,
    saleAmount: 1_500_000,
    inboundDate: "2026-04-01",
    outboundDate: "2026-04-11", // 10일 보관
  };

  test("정상 케이스 — 모든 비용 항목 정확히 계산", () => {
    const r = calculateOutboundCost(baseInput);
    expect(r.unitCost).toBe(1000);                  // 1,000,000 / 1000
    expect(r.daysHeld).toBe(10);                    // 4/1 ~ 4/11
    expect(r.refrigerationCost).toBe(500);          // 50 × 10
    expect(r.inOutFee).toBe(10_000);
    expect(r.unionFee).toBe(5_000);
    expect(r.freezeFee).toBe(0);
    expect(r.totalCost).toBe(16_500);               // 1000 + 500 + 10000 + 5000 + 0
    expect(r.profit).toBe(1_483_500);               // 1,500,000 - 16,500
  });

  test("동결비 합산 — totalCost에 freezeFee 포함", () => {
    const r = calculateOutboundCost({ ...baseInput, freezeFee: 3_000 });
    expect(r.freezeFee).toBe(3_000);
    expect(r.totalCost).toBe(19_500); // 1000 + 500 + 10000 + 5000 + 3000
    expect(r.profit).toBe(1_480_500); // 1,500,000 - 19,500
  });

  test("총중량 0 → 단가 0 (division-by-zero 방지)", () => {
    const r = calculateOutboundCost({ ...baseInput, totalWeight: 0 });
    expect(r.unitCost).toBe(0);
    expect(r.totalCost).toBe(15_500); // 0 + 500 + 10000 + 5000 + 0
  });

  test("냉장료단가 0 → 냉장료 0 (장기보관해도)", () => {
    const r = calculateOutboundCost({
      ...baseInput,
      refrigerationFeePerUnit: 0,
      inboundDate: "2026-01-01",
      outboundDate: "2026-12-31",
    });
    expect(r.refrigerationCost).toBe(0);
  });

  test("출고일이 입고일보다 앞 → 보관일수 0", () => {
    const r = calculateOutboundCost({
      ...baseInput,
      inboundDate: "2026-04-15",
      outboundDate: "2026-04-10",
    });
    expect(r.daysHeld).toBe(0);
    expect(r.refrigerationCost).toBe(0);
  });

  test("판매금액 < 판매원가 → 손익 음수", () => {
    const r = calculateOutboundCost({ ...baseInput, saleAmount: 10_000 });
    expect(r.profit).toBe(10_000 - 16_500); // -6,500
    expect(r.profit).toBeLessThan(0);
  });

  test("이월 경비 4개 합산 — totalCost에 carried* 포함", () => {
    const r = calculateOutboundCost({
      ...baseInput,
      carriedRefrigeration: 1_000,
      carriedInOutFee: 2_000,
      carriedUnionFee: 500,
      carriedFreezeFee: 300,
    });
    expect(r.totalCost).toBe(16_500 + 3_800); // 단가/냉장료/입출고/노조 + 이월 4개
    expect(r.profit).toBe(1_500_000 - (16_500 + 3_800));
  });
});

describe("calculateTransferPricing (옵션 B)", () => {
  const zeroCarried = {
    carriedRefrigeration: 0,
    carriedInOutFee: 0,
    carriedUnionFee: 0,
    carriedFreezeFee: 0,
  };

  test("절반 이동 → 새 수매가 + 이월 4개 모두 절반", () => {
    const r = calculateTransferPricing({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 100_000,
      inOutFee: 50_000,
      unionFee: 30_000,
      freezeCost: 20_000,
      ...zeroCarried,
      currentStock: 100,
      transferQty: 50,
    });
    expect(r.newPurchasePrice).toBe(500_000);         // 1_000_000 × 0.5
    expect(r.newCarriedRefrigeration).toBe(50_000);   // 100_000 × 0.5
    expect(r.newCarriedInOutFee).toBe(25_000);
    expect(r.newCarriedUnionFee).toBe(15_000);
    expect(r.newCarriedFreezeFee).toBe(10_000);
  });

  test("전체 이동 → 새 수매가 = 원본 수매가, 이월 4개 = 원본 비용 전체", () => {
    const r = calculateTransferPricing({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 10_000,
      inOutFee: 5_000,
      unionFee: 3_000,
      freezeCost: 2_000,
      ...zeroCarried,
      currentStock: 100,
      transferQty: 100,
    });
    expect(r.newPurchasePrice).toBe(1_000_000);
    expect(r.newCarriedRefrigeration).toBe(10_000);
    expect(r.newCarriedInOutFee).toBe(5_000);
    expect(r.newCarriedUnionFee).toBe(3_000);
    expect(r.newCarriedFreezeFee).toBe(2_000);
  });

  test("재고 0 → 비율 0 → 모든 결과 0", () => {
    const r = calculateTransferPricing({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 100_000,
      inOutFee: 50_000,
      unionFee: 30_000,
      freezeCost: 20_000,
      ...zeroCarried,
      currentStock: 0,
      transferQty: 50,
    });
    expect(r.newPurchasePrice).toBe(0);
    expect(r.newCarriedRefrigeration).toBe(0);
    expect(r.newCarriedInOutFee).toBe(0);
    expect(r.newCarriedUnionFee).toBe(0);
    expect(r.newCarriedFreezeFee).toBe(0);
  });

  test("D1 재이동 — 원본 이월 + 현재 비용을 합산해 다시 비례 분할", () => {
    // 원본 LOT (이미 한번 이동된 LOT): 누적냉장료 5_000, 이월냉장료 10_000, 입출고비 3_000, 이월입출고비 2_000
    // 50% 재이동 시: 새 이월냉장료 = (5_000 + 10_000) × 0.5 = 7_500
    //                새 이월입출고비 = (3_000 + 2_000) × 0.5 = 2_500
    const r = calculateTransferPricing({
      purchasePrice: 200_000,
      refrigerationCostAccum: 5_000,
      inOutFee: 3_000,
      unionFee: 1_000,
      freezeCost: 500,
      carriedRefrigeration: 10_000,
      carriedInOutFee: 2_000,
      carriedUnionFee: 800,
      carriedFreezeFee: 400,
      currentStock: 100,
      transferQty: 50,
    });
    expect(r.newPurchasePrice).toBe(100_000);
    expect(r.newCarriedRefrigeration).toBe(7_500);
    expect(r.newCarriedInOutFee).toBe(2_500);
    expect(r.newCarriedUnionFee).toBe(900);
    expect(r.newCarriedFreezeFee).toBe(450);
  });

  test("결과는 반올림된 정수", () => {
    const r = calculateTransferPricing({
      purchasePrice: 1_000_001,
      refrigerationCostAccum: 0,
      inOutFee: 0,
      unionFee: 0,
      freezeCost: 0,
      ...zeroCarried,
      currentStock: 100,
      transferQty: 33,
    });
    expect(Number.isInteger(r.newPurchasePrice)).toBe(true);
    expect(r.newPurchasePrice).toBe(330_000);
  });
});
