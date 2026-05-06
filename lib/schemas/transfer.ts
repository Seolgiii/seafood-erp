import { z } from "zod";
import { LinkedRecord, NumberLike, airtableRecordSchema } from "./common";

/**
 * 재고 이동 (transfer) 테이블 스키마
 *
 * 흐름: 원본 LOT을 일부 차감하고 새 보관처에 신규 LOT 생성.
 *  - 신청 시: 원본 LOT 링크 + 이동수량 + 이동 전/후 보관처 + 이동일 + 작업자
 *  - 승인 시: approveTransfer가 새 입고관리/LOT 생성하고 원본 LOT 차감
 *
 * 입고관리와는 다른 테이블이므로 별도 스키마 유지.
 */

export const TransferFieldsSchema = z
  .object({
    이동일: z.string().optional(),
    이동수량: NumberLike,

    "원본 LOT번호": LinkedRecord, // LOT별 재고 link
    "이동 전 보관처": LinkedRecord, // 보관처 마스터 link
    "이동 후 보관처": LinkedRecord, // 보관처 마스터 link

    작업자: LinkedRecord,

    승인상태: z.string().optional(),
    반려사유: z.string().optional(),
  })
  .loose();

export type TransferFields = z.infer<typeof TransferFieldsSchema>;

export const TransferRecordSchema = airtableRecordSchema(TransferFieldsSchema);
export type TransferRecord = z.infer<typeof TransferRecordSchema>;
