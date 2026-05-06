import { z } from "zod";

/**
 * Airtable 응답 공통 zod 스키마 헬퍼
 *
 * Airtable의 특수성:
 *  - 빈 필드는 응답에서 누락됨 (모든 필드는 옵셔널)
 *  - linked record 필드는 string ID 배열
 *  - lookup/rollup 필드는 배열로 오지만 단일값 케이스도 있음
 *  - number 필드가 가끔 string으로 직렬화되어 옴
 *  - boolean(체크박스)도 1/0/true/"true"/"1" 등 다양한 표현
 */

/** Airtable linked record 필드 — 배열 또는 단일 string */
export const LinkedRecord = z.union([
  z.array(z.string()),
  z.string(),
]).optional();

/** Lookup/Rollup 필드 — 보통 배열, 가끔 단일값 */
export const LookupValue = z.union([
  z.array(z.union([z.string(), z.number()])),
  z.string(),
  z.number(),
]).optional();

/** 숫자 필드 — Airtable이 string으로 반환할 수 있음 */
export const NumberLike = z.union([z.number(), z.string()]).optional();

/** 체크박스/활성 필드 — boolean / 1/0 / "true" 등 */
export const Activeish = z
  .union([z.boolean(), z.number(), z.string()])
  .optional();

/** Airtable attachment 배열 (파일 업로드 필드) */
export const AttachmentArray = z
  .array(
    z
      .object({
        id: z.string().optional(),
        url: z.string().optional(),
        filename: z.string().optional(),
        type: z.string().optional(),
        size: z.number().optional(),
      })
      .loose(),
  )
  .optional();

/**
 * Airtable 레코드 wrapper (id + createdTime + fields)
 *
 * @example
 * const WorkerRecord = airtableRecordSchema(WorkerFieldsSchema);
 */
export function airtableRecordSchema<T extends z.ZodTypeAny>(fieldsSchema: T) {
  return z
    .object({
      id: z.string(),
      createdTime: z.string().optional(),
      fields: fieldsSchema,
    })
    .loose();
}

/**
 * Airtable 목록 응답 ({ records, offset })
 */
export function airtableListSchema<T extends z.ZodTypeAny>(recordSchema: T) {
  return z
    .object({
      records: z.array(recordSchema).optional(),
      offset: z.string().optional(),
    })
    .loose();
}

/**
 * 검증 결과 모니터링 헬퍼.
 *
 * safeParse 후 실패한 issue들을 한 줄 로그로 남기되 throw하지 않음.
 * 호출자는 원본 데이터를 그대로 사용 — 1차 도입은 모니터링 모드.
 */
export function reportSchemaIssue(
  context: string,
  recordId: string | undefined,
  error: z.ZodError,
): void {
  // 너무 길어지지 않게 처음 3개 issue만
  const issues = error.issues.slice(0, 3).map((i) => {
    const path = i.path.length ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  // 운영자 grep용 prefix
  // 실제 import는 호출자가 함 (logger 의존성 순환 방지를 위해 console 사용)
  // eslint-disable-next-line no-console
  console.warn(
    `[SCHEMA-MISMATCH] ${context}${recordId ? ` (${recordId})` : ""}:`,
    issues.join(" | "),
    error.issues.length > 3 ? `(+${error.issues.length - 3} more)` : "",
  );
}
