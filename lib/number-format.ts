const LOCALE = "ko-KR" as const;

/** 화면 표시용: 정수 천 단위 콤마 */
export function formatIntKo(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.trunc(n).toLocaleString(LOCALE);
}

/**
 * 수량·잔여 등: 정수는 그룹핑, 소수는 최대 3자리까지 정리 후 정수부만 그룹핑.
 */
export function formatQtyKo(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString(LOCALE);
  const s = n.toFixed(3).replace(/\.?0+$/, "");
  const [ip, fp] = s.split(".");
  const intNum = Number.parseInt(ip, 10) || 0;
  const intFmt = intNum.toLocaleString(LOCALE);
  return fp != null && fp.length > 0 ? `${intFmt}.${fp}` : intFmt;
}

/**
 * 정수만 (입고·출고 수량 입력창). 콤마 표시, API는 value.
 */
export function fromGroupedIntegerInput(raw: string): { display: string; value: number } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { display: "", value: 0 };
  const normalized = digits.replace(/^0+(?=\d)/, "") || "0";
  const v = Number.parseInt(normalized, 10);
  if (!Number.isFinite(v)) return { display: "", value: 0 };
  return { display: v.toLocaleString(LOCALE), value: v };
}

/**
 * 선택적 정수 (수매가). 빈 입력 → value null (미전송).
 */
export function fromGroupedOptionalIntInput(raw: string): {
  display: string;
  value: number | null;
} {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { display: "", value: null };
  const normalized = digits.replace(/^0+(?=\d)/, "") || "0";
  const v = Number.parseInt(normalized, 10);
  if (!Number.isFinite(v) || v < 0) return { display: "", value: null };
  return { display: v.toLocaleString(LOCALE), value: v };
}

/**
 * 출고 수량 등: 정수부에 콤마, 소수부 최대 3자리(선택).
 */
export function fromGroupedQtyInputAllowDecimal(raw: string): {
  display: string;
  value: number;
} {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return { display: "", value: 0 };

  const dot = cleaned.indexOf(".");
  let head: string;
  let tail: string;
  if (dot < 0) {
    head = cleaned;
    tail = "";
  } else {
    head = cleaned.slice(0, dot);
    tail = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3);
  }

  const trailingDot = dot >= 0 && cleaned.endsWith(".") && tail === "";

  head = head.replace(/^0+(?=\d)/, "");
  if (head === "" && tail === "" && dot < 0) return { display: "", value: 0 };

  if (trailingDot) {
    const intNum = Number.parseInt(head || "0", 10) || 0;
    return {
      display: `${intNum.toLocaleString(LOCALE)}.`,
      value: intNum,
    };
  }

  const intNorm = head === "" && tail !== "" ? "0" : head || "0";
  const norm = tail.length > 0 ? `${intNorm}.${tail}` : intNorm;
  const value = Number.parseFloat(norm);
  if (!Number.isFinite(value)) return { display: "", value: 0 };

  if (norm.includes(".")) {
    const [a, b] = norm.split(".");
    const intNum = Number.parseInt(a || "0", 10) || 0;
    return {
      display: `${intNum.toLocaleString(LOCALE)}.${b}`,
      value,
    };
  }
  const intNum = Number.parseInt(norm, 10) || 0;
  return { display: intNum.toLocaleString(LOCALE), value };
}
