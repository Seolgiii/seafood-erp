import { z } from "zod";
import {
  LinkedRecord,
  LookupValue,
  NumberLike,
  airtableRecordSchema,
} from "./common";

/**
 * LOT별 재고 (lots) 테이블 스키마
 *
 * 핵심 필드:
 *  - LOT번호 (텍스트, primary)
 *  - 품목 (품목마스터 link)
 *  - 입고관리링크 (입고 관리 link)
 *  - 재고수량 / 기준단위_재고 / 상세단위_재고
 *  - 보관처 (보관처 마스터 link)
 *  - 입고일자 (Date)
 *  - 수매가, 냉장료단가, 입출고비, 노조비 (number)
 */

export const LotFieldsSchema = z
  .object({
    LOT번호: z.string().optional(),
    품목: LinkedRecord,
    품목명: LookupValue, // 룩업
    규격: z.string().optional(),
    규격표시: z.string().optional(),
    상세규격_표기: z.string().optional(),
    미수: z.string().optional(),

    재고수량: NumberLike,
    기준단위_재고: NumberLike,
    상세단위_재고: NumberLike,
    현재고: z.string().optional(),

    "입고수량(BOX)": NumberLike,
    수매가: NumberLike,
    단가: NumberLike,
    총중량: NumberLike,
    판매원가: NumberLike,
    원산지: z.string().optional(),

    보관처: LinkedRecord,
    입고일자: z.string().optional(),
    입고관리링크: LinkedRecord,
    매입처: LinkedRecord,
    품목구분: z.string().optional(),

    냉장료단가: NumberLike,
    입출고비: NumberLike,
    노조비: NumberLike,

    승인상태: z.string().optional(),
    비고: z.string().optional(),
    입고자: LinkedRecord,
  })
  .loose();

export type LotFields = z.infer<typeof LotFieldsSchema>;

export const LotRecordSchema = airtableRecordSchema(LotFieldsSchema);
export type LotRecord = z.infer<typeof LotRecordSchema>;
