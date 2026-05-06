import { z } from "zod";
import { LinkedRecord, NumberLike, airtableRecordSchema } from "./common";

/**
 * 입고 관리 (inbound) 테이블 스키마
 */

export const InboundFieldsSchema = z
  .object({
    입고일: z.string().optional(),
    입고일자: z.string().optional(), // 일부 베이스 변형
    LOT번호: z.string().optional(),

    품목마스터: LinkedRecord,
    품목: LinkedRecord, // 일부 베이스 변형
    작업자: LinkedRecord,
    매입자: LinkedRecord,
    매입처: LinkedRecord,
    보관처: LinkedRecord,

    규격: z.string().optional(),
    미수: z.string().optional(),
    원산지: z.string().optional(),
    선박명: z.string().optional(),
    비고: z.string().optional(),

    입고수량: NumberLike,
    "입고수량(BOX)": NumberLike,
    잔여수량: NumberLike,
    수매가: NumberLike,

    승인상태: z.string().optional(),
    반려사유: z.string().optional(),
    입고증URL: z.string().optional(),
  })
  .loose();

export type InboundFields = z.infer<typeof InboundFieldsSchema>;

export const InboundRecordSchema = airtableRecordSchema(InboundFieldsSchema);
export type InboundRecord = z.infer<typeof InboundRecordSchema>;
