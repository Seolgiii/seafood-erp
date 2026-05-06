/**
 * Airtable 응답 zod 스키마 일괄 export
 *
 * 사용 예:
 *   import { WorkerFieldsSchema, reportSchemaIssue } from "@/lib/schemas";
 *
 *   const data = await fetchAirtable(`workers/${id}`);
 *   const result = WorkerFieldsSchema.safeParse(data.fields);
 *   if (!result.success) {
 *     reportSchemaIssue("verifyWorkerPin", id, result.error);
 *   }
 *   // 모니터링 모드 — 검증 실패해도 원본 fields를 그대로 사용
 */

export * from "./common";
export * from "./worker";
export * from "./product";
export * from "./lot";
export * from "./inbound";
export * from "./outbound";
export * from "./expense";
export * from "./storage";
export * from "./supplier";
export * from "./transfer";
