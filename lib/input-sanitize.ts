import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// 사용자 입력 정규화·검증 헬퍼
// - 자유 텍스트 필드의 trim, 제어문자 제거, 길이 상한 검사를 수행합니다.
// - 길이 초과 시 throw 하여 서버 액션이 catch → 사용자에게 명확한 메시지 반환.
// ─────────────────────────────────────────────────────────────────────────────

/** 필드별 최대 길이 정책 (사용자 합의 기준) */
export const FIELD_MAX_LEN = {
  /** 출고 — 판매처 */
  seller: 30,
  /** 입고 — 비고 (자유 메모) */
  inboundMemo: 200,
  /** 입고 — 선박명 */
  shipName: 30,
  /** 지출결의 — 건명 (PDF 표지에 노출) */
  expenseTitle: 50,
  /** 지출결의 — 적요 (사용 사유) */
  expenseDescription: 500,
  /** 지출결의 — 비고 */
  expenseRemarks: 200,
} as const;

export type FieldName = keyof typeof FIELD_MAX_LEN;

export class InputValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "InputValidationError";
  }
}

/** 제어문자(탭/줄바꿈 제외)·NULL 제거 + trim */
function normalizeText(raw: unknown): string {
  if (raw == null) return "";
  const str = typeof raw === "string" ? raw : String(raw);
  // \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F 제거 (탭 \x09, LF \x0A, CR \x0D 보존)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * 자유 텍스트 입력을 정규화하고, 길이 상한을 강제합니다.
 * 빈 문자열은 그대로 반환 — 필수 검사는 호출부에서 별도로 수행.
 *
 * @throws {InputValidationError} 길이 초과 시
 */
export function sanitizeText(raw: unknown, field: FieldName, label?: string): string {
  const cleaned = normalizeText(raw);
  const max = FIELD_MAX_LEN[field];
  if (cleaned.length > max) {
    throw new InputValidationError(
      field,
      `${label ?? field}은(는) 최대 ${max}자까지 입력할 수 있습니다. (현재 ${cleaned.length}자)`,
    );
  }
  return cleaned;
}
