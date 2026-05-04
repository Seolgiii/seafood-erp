import { describe, expect, test } from "vitest";
import {
  formatIntKo,
  formatQtyKo,
  fromGroupedIntegerInput,
  fromGroupedOptionalIntInput,
  fromGroupedQtyInputAllowDecimal,
} from "./number-format";

describe("formatIntKo", () => {
  test("기본 정수 → 천 단위 콤마", () => {
    expect(formatIntKo(0)).toBe("0");
    expect(formatIntKo(1000)).toBe("1,000");
    expect(formatIntKo(1_234_567)).toBe("1,234,567");
  });

  test("음수도 정상 표기", () => {
    expect(formatIntKo(-1000)).toBe("-1,000");
  });

  test("소수 → 정수부만 표기 (truncate)", () => {
    expect(formatIntKo(1234.99)).toBe("1,234");
    expect(formatIntKo(1234.01)).toBe("1,234");
  });

  test("NaN/Infinity → '0'", () => {
    expect(formatIntKo(NaN)).toBe("0");
    expect(formatIntKo(Infinity)).toBe("0");
    expect(formatIntKo(-Infinity)).toBe("0");
  });
});

describe("formatQtyKo", () => {
  test("정수는 그룹핑", () => {
    expect(formatQtyKo(1234)).toBe("1,234");
  });

  test("소수는 최대 3자리, 0 패딩 제거", () => {
    expect(formatQtyKo(1234.5)).toBe("1,234.5");
    expect(formatQtyKo(1234.500)).toBe("1,234.5");
    expect(formatQtyKo(1234.123)).toBe("1,234.123");
  });

  test("4번째 소수 자리는 반올림 후 절단", () => {
    expect(formatQtyKo(1.2349)).toBe("1.235");
  });

  test("0.x — 정수부 0과 소수부 표기", () => {
    expect(formatQtyKo(0.5)).toBe("0.5");
  });

  test("NaN → '0'", () => {
    expect(formatQtyKo(NaN)).toBe("0");
  });
});

describe("fromGroupedIntegerInput — 정수 입력", () => {
  test("기본 입력 → 콤마 표기", () => {
    expect(fromGroupedIntegerInput("1000")).toEqual({ display: "1,000", value: 1000 });
    expect(fromGroupedIntegerInput("1234567")).toEqual({ display: "1,234,567", value: 1_234_567 });
  });

  test("이미 콤마가 있는 입력 정규화", () => {
    expect(fromGroupedIntegerInput("1,234")).toEqual({ display: "1,234", value: 1234 });
  });

  test("문자 섞인 입력은 숫자만 추출", () => {
    expect(fromGroupedIntegerInput("12abc34")).toEqual({ display: "1,234", value: 1234 });
  });

  test("선행 0 제거", () => {
    expect(fromGroupedIntegerInput("000123")).toEqual({ display: "123", value: 123 });
  });

  test("0만 입력 → 0 반환", () => {
    expect(fromGroupedIntegerInput("0")).toEqual({ display: "0", value: 0 });
    expect(fromGroupedIntegerInput("0000")).toEqual({ display: "0", value: 0 });
  });

  test("빈 입력/공백/문자만 → display 빈, value 0", () => {
    expect(fromGroupedIntegerInput("")).toEqual({ display: "", value: 0 });
    expect(fromGroupedIntegerInput("   ")).toEqual({ display: "", value: 0 });
    expect(fromGroupedIntegerInput("abc")).toEqual({ display: "", value: 0 });
  });

  test("음수 부호 무시 (정수 양수만 허용)", () => {
    // '-' 제거되고 숫자만 남음
    expect(fromGroupedIntegerInput("-100")).toEqual({ display: "100", value: 100 });
  });
});

describe("fromGroupedOptionalIntInput — 선택 정수 (수매가)", () => {
  test("정상 입력", () => {
    expect(fromGroupedOptionalIntInput("50000")).toEqual({ display: "50,000", value: 50_000 });
  });

  test("빈 입력 → value null (미전송 의도)", () => {
    expect(fromGroupedOptionalIntInput("")).toEqual({ display: "", value: null });
    expect(fromGroupedOptionalIntInput("abc")).toEqual({ display: "", value: null });
  });

  test("0은 유효한 값 (null이 아님)", () => {
    expect(fromGroupedOptionalIntInput("0")).toEqual({ display: "0", value: 0 });
  });
});

describe("fromGroupedQtyInputAllowDecimal — 수량(소수 허용)", () => {
  test("정수 입력 → 그룹핑", () => {
    expect(fromGroupedQtyInputAllowDecimal("1000")).toEqual({ display: "1,000", value: 1000 });
  });

  test("소수 입력 → 정수부 콤마 + 소수부 유지", () => {
    expect(fromGroupedQtyInputAllowDecimal("1000.5")).toEqual({ display: "1,000.5", value: 1000.5 });
    expect(fromGroupedQtyInputAllowDecimal("1234.567")).toEqual({ display: "1,234.567", value: 1234.567 });
  });

  test("소수부는 최대 3자리로 절단", () => {
    expect(fromGroupedQtyInputAllowDecimal("1.23456")).toEqual({ display: "1.234", value: 1.234 });
  });

  test("입력 중간 — 점만 입력 (display 유지)", () => {
    expect(fromGroupedQtyInputAllowDecimal("1234.")).toEqual({ display: "1,234.", value: 1234 });
  });

  test("0.x 형식", () => {
    expect(fromGroupedQtyInputAllowDecimal("0.5")).toEqual({ display: "0.5", value: 0.5 });
  });

  test(".5 → 0.5로 정규화", () => {
    expect(fromGroupedQtyInputAllowDecimal(".5")).toEqual({ display: "0.5", value: 0.5 });
  });

  test("빈/문자만 → 빈 결과", () => {
    expect(fromGroupedQtyInputAllowDecimal("")).toEqual({ display: "", value: 0 });
    expect(fromGroupedQtyInputAllowDecimal("abc")).toEqual({ display: "", value: 0 });
  });

  test("점 여러 개 — 첫 점만 인정", () => {
    expect(fromGroupedQtyInputAllowDecimal("1.2.3")).toEqual({ display: "1.23", value: 1.23 });
  });

  test("선행 0 제거 (정수부)", () => {
    expect(fromGroupedQtyInputAllowDecimal("0123")).toEqual({ display: "123", value: 123 });
  });

  test("이미 콤마가 있는 입력 처리", () => {
    expect(fromGroupedQtyInputAllowDecimal("1,234.5")).toEqual({ display: "1,234.5", value: 1234.5 });
  });
});
