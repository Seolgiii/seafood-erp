import { z } from "zod";
import { LinkedRecord, NumberLike, airtableRecordSchema } from "./common";

/**
 * 품목마스터 (products) 테이블 스키마
 */

export const ProductFieldsSchema = z
  .object({
    품목명: z.string().optional(),
    품목코드: z.string().optional(),
    "품목 구분": z.string().optional(), // 원물 / 가공
    품목구분: z.string().optional(), // 일부 베이스에서 띄어쓰기 없는 변형도 허용
    규격표시: z.string().optional(),
    상세규격_표기: z.string().optional(),
    기준단위_라벨: z.string().optional(), // 예: "박스"
    상세단위_라벨: z.string().optional(), // 예: "마리"
    기준1당_상세수량: NumberLike, // 박스당 마리 수
    권장표기: z.string().optional(),
    원산지: z.string().optional(),
    "LOT별 재고": LinkedRecord, // 연결된 LOT 레코드 ID 배열
  })
  .loose();

export type ProductFields = z.infer<typeof ProductFieldsSchema>;

export const ProductRecordSchema = airtableRecordSchema(ProductFieldsSchema);
export type ProductRecord = z.infer<typeof ProductRecordSchema>;
