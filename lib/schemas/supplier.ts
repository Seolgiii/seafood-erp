import { z } from "zod";
import { airtableRecordSchema } from "./common";

/**
 * 매입처 마스터 (suppliers) 테이블 스키마
 */
export const SupplierFieldsSchema = z
  .object({
    매입처명: z.string().optional(),
  })
  .loose();

export type SupplierFields = z.infer<typeof SupplierFieldsSchema>;

export const SupplierRecordSchema = airtableRecordSchema(SupplierFieldsSchema);
export type SupplierRecord = z.infer<typeof SupplierRecordSchema>;
