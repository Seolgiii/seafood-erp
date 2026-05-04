import { describe, expect, test } from "vitest";
import {
  FIELD_MAX_LEN,
  InputValidationError,
  sanitizeText,
} from "./input-sanitize";

describe("sanitizeText — 정상 통과", () => {
  test("일반 텍스트는 그대로 반환", () => {
    expect(sanitizeText("○○수산", "seller")).toBe("○○수산");
  });

  test("한글·영문·숫자 혼합 통과", () => {
    expect(sanitizeText("Pier-3 노량진 #12", "seller")).toBe("Pier-3 노량진 #12");
  });
});

describe("sanitizeText — 정규화", () => {
  test("앞뒤 공백 trim", () => {
    expect(sanitizeText("  ○○수산  ", "seller")).toBe("○○수산");
  });

  test("탭/줄바꿈은 보존 (자유 메모용)", () => {
    expect(sanitizeText("줄1\n줄2\t끝", "inboundMemo")).toBe("줄1\n줄2\t끝");
  });

  test("CR(\\r)은 보존", () => {
    expect(sanitizeText("a\r\nb", "inboundMemo")).toBe("a\r\nb");
  });

  test("NULL/제어문자(0x00-0x08, 0x0B, 0x0E-0x1F) 제거", () => {
    expect(sanitizeText("a\x00b\x01c", "seller")).toBe("abc");
    expect(sanitizeText("\x07hello\x1F", "seller")).toBe("hello");
  });

  test("DEL(0x7F) 제거", () => {
    expect(sanitizeText("hello\x7Fworld", "seller")).toBe("helloworld");
  });

  test("null/undefined → 빈 문자열", () => {
    expect(sanitizeText(null, "seller")).toBe("");
    expect(sanitizeText(undefined, "seller")).toBe("");
  });

  test("숫자 입력 → 문자열 변환", () => {
    expect(sanitizeText(12345, "seller")).toBe("12345");
  });

  test("빈 문자열 → 빈 문자열 (필수 검사는 호출부에서)", () => {
    expect(sanitizeText("", "seller")).toBe("");
    expect(sanitizeText("   ", "seller")).toBe("");
  });
});

describe("sanitizeText — 길이 제한", () => {
  test("판매처 30자 — 정확히 30자 통과", () => {
    const exact = "가".repeat(30);
    expect(sanitizeText(exact, "seller")).toBe(exact);
  });

  test("판매처 31자 → InputValidationError", () => {
    const over = "가".repeat(31);
    expect(() => sanitizeText(over, "seller")).toThrow(InputValidationError);
  });

  test("입고 비고 200자 — 정확히 통과", () => {
    const exact = "메".repeat(200);
    expect(sanitizeText(exact, "inboundMemo")).toBe(exact);
  });

  test("입고 비고 201자 → 거부", () => {
    expect(() => sanitizeText("메".repeat(201), "inboundMemo")).toThrow(InputValidationError);
  });

  test("선박명 30자 통과 / 31자 거부", () => {
    expect(sanitizeText("선".repeat(30), "shipName")).toHaveLength(30);
    expect(() => sanitizeText("선".repeat(31), "shipName")).toThrow(InputValidationError);
  });

  test("지출 건명 50자 통과 / 51자 거부", () => {
    expect(sanitizeText("건".repeat(50), "expenseTitle")).toHaveLength(50);
    expect(() => sanitizeText("건".repeat(51), "expenseTitle")).toThrow(InputValidationError);
  });

  test("지출 적요 500자 통과 / 501자 거부", () => {
    expect(sanitizeText("적".repeat(500), "expenseDescription")).toHaveLength(500);
    expect(() => sanitizeText("적".repeat(501), "expenseDescription")).toThrow(InputValidationError);
  });

  test("지출 비고 200자 통과 / 201자 거부", () => {
    expect(sanitizeText("비".repeat(200), "expenseRemarks")).toHaveLength(200);
    expect(() => sanitizeText("비".repeat(201), "expenseRemarks")).toThrow(InputValidationError);
  });
});

describe("sanitizeText — InputValidationError 메타데이터", () => {
  test("error.field에 필드명 저장", () => {
    try {
      sanitizeText("가".repeat(31), "seller");
      throw new Error("not reached");
    } catch (e) {
      expect(e).toBeInstanceOf(InputValidationError);
      expect((e as InputValidationError).field).toBe("seller");
    }
  });

  test("label 옵션이 메시지에 반영", () => {
    try {
      sanitizeText("가".repeat(31), "seller", "판매처");
    } catch (e) {
      expect((e as Error).message).toContain("판매처");
      expect((e as Error).message).toContain("30자");
      expect((e as Error).message).toContain("31자");
    }
  });

  test("label 미지정 시 field 키가 메시지에 들어감", () => {
    try {
      sanitizeText("가".repeat(31), "seller");
    } catch (e) {
      expect((e as Error).message).toContain("seller");
    }
  });
});

describe("sanitizeText — 길이 검사는 정규화 후 적용", () => {
  test("trim 후 길이가 한도 내면 통과", () => {
    // 30자 + 양옆 공백 → trim 후 30자
    const input = `   ${"가".repeat(30)}   `;
    expect(sanitizeText(input, "seller")).toBe("가".repeat(30));
  });

  test("제어문자 제거 후 길이가 한도 내면 통과", () => {
    // 31자 중 1자가 NULL → 제거 후 30자
    const input = "\x00" + "가".repeat(30);
    expect(sanitizeText(input, "seller")).toBe("가".repeat(30));
  });
});

describe("FIELD_MAX_LEN 정책", () => {
  test("정책 값이 합의된 숫자와 일치", () => {
    expect(FIELD_MAX_LEN.seller).toBe(30);
    expect(FIELD_MAX_LEN.inboundMemo).toBe(200);
    expect(FIELD_MAX_LEN.shipName).toBe(30);
    expect(FIELD_MAX_LEN.expenseTitle).toBe(50);
    expect(FIELD_MAX_LEN.expenseDescription).toBe(500);
    expect(FIELD_MAX_LEN.expenseRemarks).toBe(200);
  });
});
