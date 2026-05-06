import { z } from "zod";
import { NumberLike, airtableRecordSchema } from "./common";

/**
 * 보관처 마스터 (storages) 테이블 스키마
 */
export const StorageFieldsSchema = z
  .object({
    보관처명: z.string().optional(),
  })
  .loose();

export type StorageFields = z.infer<typeof StorageFieldsSchema>;

export const StorageRecordSchema = airtableRecordSchema(StorageFieldsSchema);
export type StorageRecord = z.infer<typeof StorageRecordSchema>;

/**
 * 보관처 비용 이력 (storage cost history) 테이블 스키마
 *
 * 적용시작일 ≤ 입고일자 ≤ 적용종료일 인 행을 조회하여
 * 냉장료/입출고비/노조비를 LOT별 재고에 반영합니다.
 */
export const StorageCostFieldsSchema = z
  .object({
    보관처명: z.string().optional(),
    적용시작일: z.string().optional(),
    적용종료일: z.string().optional(),
    냉장료: NumberLike,
    입출고비: NumberLike,
    노조비: NumberLike,
  })
  .loose();

export type StorageCostFields = z.infer<typeof StorageCostFieldsSchema>;

export const StorageCostRecordSchema = airtableRecordSchema(
  StorageCostFieldsSchema,
);
export type StorageCostRecord = z.infer<typeof StorageCostRecordSchema>;
