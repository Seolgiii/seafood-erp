import { z } from "zod";
import { Activeish, airtableRecordSchema } from "./common";

/**
 * 작업자 (workers) 테이블 스키마
 *
 * 한글 필드명을 그대로 키로 사용 — Airtable 응답 구조와 1:1 매칭.
 * 모든 필드 옵셔널 (빈 필드는 응답에서 누락됨).
 */

export const WorkerFieldsSchema = z
  .object({
    작업자명: z.string().optional(),
    PIN: z.union([z.string(), z.number()]).optional(),
    활성: Activeish,
    권한: z.string().optional(), // ADMIN / MASTER / WORKER

    // PIN 해시화 도입 후 추가된 필드 (lib/pin-hash.ts)
    pin_hash: z.string().optional(),
    pin_fail_count: z.number().optional(),
    pin_locked_until: z.number().optional(),
  })
  .loose();

export type WorkerFields = z.infer<typeof WorkerFieldsSchema>;

export const WorkerRecordSchema = airtableRecordSchema(WorkerFieldsSchema);
export type WorkerRecord = z.infer<typeof WorkerRecordSchema>;
