import { z } from "zod";
import {
  AttachmentArray,
  LinkedRecord,
  LookupValue,
  NumberLike,
  airtableRecordSchema,
} from "./common";

/**
 * 출고 관리 (outbound) 테이블 스키마
 *
 * 주의: "입고관리" 필드는 입고 관리 record를 link하는 link 필드이고,
 *       "LOT번호"는 입고관리.LOT번호를 가져오는 룩업.
 */

export const OutboundFieldsSchema = z
  .object({
    출고일: z.string().optional(),
    입고관리: LinkedRecord, // 입고 관리 link
    LOT번호: LookupValue, // 룩업
    LOT재고레코드ID: z.string().optional(),

    출고수량: NumberLike,
    작업자: LinkedRecord,
    보관처: LinkedRecord,
    판매처: z.string().optional(),
    판매가: NumberLike,
    /** formula 필드: 판매가 × 출고수량 (Airtable이 자동 계산) */
    판매금액: NumberLike,
    규격: z.string().optional(),
    미수: z.string().optional(),
    원산지: z.string().optional(),

    승인상태: z.string().optional(),
    반려사유: z.string().optional(),
    출고증URL: z.string().optional(),

    // 출고 승인 시 스냅샷되는 비용 8개 필드
    "출고시점 단가": NumberLike,
    "출고시점 냉장료": NumberLike,
    "출고시점 입출고비": NumberLike,
    "출고시점 노조비": NumberLike,
    "출고시점 동결비": NumberLike,
    "출고시점 판매원가": NumberLike,
    "출고시점 판매금액": NumberLike,
    "출고시점 손익": NumberLike,

    영수증사진: AttachmentArray,
  })
  .loose();

export type OutboundFields = z.infer<typeof OutboundFieldsSchema>;

export const OutboundRecordSchema = airtableRecordSchema(OutboundFieldsSchema);
export type OutboundRecord = z.infer<typeof OutboundRecordSchema>;
