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
 * 주의: "LOT번호" 필드는 입고 관리 record를 link하는 link 필드이고,
 *       "LOT번호(표시용)"은 룩업/롤업 텍스트.
 */

export const OutboundFieldsSchema = z
  .object({
    출고일: z.string().optional(),
    LOT번호: LinkedRecord, // 입고 관리 link
    "LOT번호(표시용)": LookupValue, // 룩업
    LOT재고레코드ID: z.string().optional(),

    출고수량: NumberLike,
    작업자: LinkedRecord,
    보관처: LinkedRecord,
    판매처: z.string().optional(),
    판매가: NumberLike,
    판매금액: NumberLike,
    규격: z.string().optional(),
    미수: z.string().optional(),
    원산지: z.string().optional(),

    승인상태: z.string().optional(),
    반려사유: z.string().optional(),
    출고증URL: z.string().optional(),

    // 출고 승인 시 스냅샷되는 비용 7개 필드
    "출고시점 단가": NumberLike,
    "출고시점 냉장료": NumberLike,
    "출고시점 입출고비": NumberLike,
    "출고시점 노조비": NumberLike,
    "출고시점 판매원가": NumberLike,
    "출고시점 판매금액": NumberLike,
    "출고시점 손익": NumberLike,

    영수증사진: AttachmentArray,
  })
  .loose();

export type OutboundFields = z.infer<typeof OutboundFieldsSchema>;

export const OutboundRecordSchema = airtableRecordSchema(OutboundFieldsSchema);
export type OutboundRecord = z.infer<typeof OutboundRecordSchema>;
