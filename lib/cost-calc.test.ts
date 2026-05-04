import { describe, expect, test } from "vitest";
import {
  calculateOutboundCost,
  calculateTransferPurchasePrice,
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
    expect(r.totalCost).toBe(16_500);               // 1000 + 500 + 10000 + 5000
    expect(r.profit).toBe(1_483_500);               // 1,500,000 - 16,500
  });

  test("총중량 0 → 단가 0 (division-by-zero 방지)", () => {
    const r = calculateOutboundCost({ ...baseInput, totalWeight: 0 });
    expect(r.unitCost).toBe(0);
    expect(r.totalCost).toBe(15_500); // 0 + 500 + 10000 + 5000
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
});

describe("calculateTransferPurchasePrice", () => {
  test("절반 이동 → 비용 절반", () => {
    const price = calculateTransferPurchasePrice({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 100_000,
      inOutFee: 50_000,
      unionFee: 30_000,
      freezeCost: 20_000,
      currentStock: 100,
      transferQty: 50,
    });
    // 총비용 1_200_000 × 0.5 = 600_000
    expect(price).toBe(600_000);
  });

  test("전체 이동 → 비용 전체", () => {
    const price = calculateTransferPurchasePrice({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 0,
      inOutFee: 0,
      unionFee: 0,
      freezeCost: 0,
      currentStock: 100,
      transferQty: 100,
    });
    expect(price).toBe(1_000_000);
  });

  test("재고 0 → 비율 0 → 가격 0 (0으로 나누기 방지)", () => {
    const price = calculateTransferPurchasePrice({
      purchasePrice: 1_000_000,
      refrigerationCostAccum: 0,
      inOutFee: 0,
      unionFee: 0,
      freezeCost: 0,
      currentStock: 0,
      transferQty: 50,
    });
    expect(price).toBe(0);
  });

  test("결과는 반올림된 정수", () => {
    // 1_000_000 × (33/100) = 330_000
    // 1_000_001 × (33/100) = 330_000.33 → 330_000
    const price1 = calculateTransferPurchasePrice({
      purchasePrice: 1_000_001,
      refrigerationCostAccum: 0,
      inOutFee: 0,
      unionFee: 0,
      freezeCost: 0,
      currentStock: 100,
      transferQty: 33,
    });
    expect(Number.isInteger(price1)).toBe(true);
    expect(price1).toBe(330_000);

    // 1_000_002 × (33/100) = 330_000.66 → 330_001
    const price2 = calculateTransferPurchasePrice({
      purchasePrice: 1_000_002,
      refrigerationCostAccum: 0,
      inOutFee: 0,
      unionFee: 0,
      freezeCost: 0,
      currentStock: 100,
      transferQty: 33,
    });
    expect(price2).toBe(330_001);
  });

  test("모든 비용 항목이 합산된 후 비율 적용", () => {
    const price = calculateTransferPurchasePrice({
      purchasePrice: 100,
      refrigerationCostAccum: 200,
      inOutFee: 300,
      unionFee: 400,
      freezeCost: 500,
      currentStock: 10,
      transferQty: 5,
    });
    // 합계 1500, 절반 → 750
    expect(price).toBe(750);
  });
});
