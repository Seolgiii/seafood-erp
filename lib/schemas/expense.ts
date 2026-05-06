import { z } from "zod";
import {
  AttachmentArray,
  LinkedRecord,
  NumberLike,
  airtableRecordSchema,
} from "./common";

/**
 * 지출결의 (expense) 테이블 스키마
 *
 * 코드에서 status는 "결재상태" 또는 "승인상태" 둘 다 사용처가 있어 둘 다 허용.
 * 마찬가지로 항목은 "항목명" 또는 "건명".
 */

export const ExpenseFieldsSchema = z
  .object({
    지출일: z.string().optional(),
    작성일: z.string().optional(),

    항목명: z.string().optional(),
    건명: z.string().optional(),
    적요: z.string().optional(),

    금액: NumberLike,

    결재상태: z.string().optional(),
    승인상태: z.string().optional(),
    반려사유: z.string().optional(),

    신청자: LinkedRecord,
    소속: z.string().optional(),
    직급: z.string().optional(),

    영수증사진: AttachmentArray,
    지출결의서URL: z.string().optional(),
  })
  .loose();

export type ExpenseFields = z.infer<typeof ExpenseFieldsSchema>;

export const ExpenseRecordSchema = airtableRecordSchema(ExpenseFieldsSchema);
export type ExpenseRecord = z.infer<typeof ExpenseRecordSchema>;
