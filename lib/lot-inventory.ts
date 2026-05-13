import type { LotSearchCard } from "@/lib/inventory-types";
import { formatQtyKo } from "@/lib/number-format";
import { formatSpecKgMisu } from "@/lib/spec-display";
import {
  AIRTABLE_TABLE,
  LOT_FIELDS,
  LOT_PENDING_APPROVAL_EXACT,
  PRODUCT_FIELDS,
} from "@/lib/airtable-schema";
import { fetchAirtable, tablePathSegment } from "@/lib/airtable";
import { getStorageCostsBatch } from "@/lib/storage-cost";

export type { LotSearchCard } from "@/lib/inventory-types";

const LOT = LOT_FIELDS;
const PR = PRODUCT_FIELDS;

function lotTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_LOT_TABLE?.trim() ?? AIRTABLE_TABLE.lots
  );
}

function productTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products
  );
}

type AirtableRecord<T> = { id: string; fields: T };

function escapeFormulaString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstLinkedId(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0];
  }
  if (typeof raw === "string" && raw.startsWith("rec")) return raw;
  return null;
}

function firstNonEmptyString(
  fields: Record<string, unknown>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const v = String(fields[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function isPendingApproval(fields: Record<string, unknown>): boolean {
  const raw = fields[LOT.approvalStatus];
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (s === LOT_PENDING_APPROVAL_EXACT) return true;
  if (s.includes("승인") && s.includes("대기")) return true;
  return false;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function orRecordIds(ids: string[]): string {
  return ids.map((id) => `RECORD_ID()="${escapeFormulaString(id)}"`).join(",");
}

type ProductRow = {
  name: string;
  spec: string;
  detailSpec: string;
};

async function fetchProductsByIds(ids: string[]): Promise<Map<string, ProductRow>> {
  const map = new Map<string, ProductRow>();
  if (ids.length === 0) return map;

  const tbl = productTable();
  const fieldList = [PR.name, PR.spec, PR.detailSpec] as const;
  const fieldsQs = fieldList
    .map((f) => `fields[]=${encodeURIComponent(f)}`)
    .join("&");

  const batches = chunk(ids, 40);
  for (const batch of batches) {
    const formula = encodeURIComponent(`OR(${orRecordIds(batch)})`);
    const path = `${tbl}?filterByFormula=${formula}&${fieldsQs}&pageSize=100`;
    const data = await fetchAirtable(path);
    const records: AirtableRecord<Record<string, unknown>>[] =
      data.records ?? [];
    for (const r of records) {
      map.set(r.id, {
        name: String(r.fields[PR.name] ?? "").trim(),
        spec: String(r.fields[PR.spec] ?? "").trim(),
        detailSpec: String(r.fields[PR.detailSpec] ?? "").trim(),
      });
    }
  }
  return map;
}

export async function searchLotsBySuffixDigits(
  digits: string
): Promise<LotSearchCard[]> {
  const q = digits.replace(/\D/g, "");
  if (!q.length) return [];

  const len = q.length;
  const esc = escapeFormulaString(q);
  const lotField = LOT.lotNumber;
  const formula = `AND(RIGHT({${lotField}}, ${len})="${esc}", {${LOT.stockQty}} > 0)`;

  const tbl = lotTable();
  const lotFields = [
    LOT.lotNumber,
    LOT.productLink,
    LOT.stockQty,
    LOT.approvalStatus,
    LOT.storage,
    LOT.firstInboundDate,
    LOT.transferInboundDate,
  ] as const;
  const fieldsQs = lotFields
    .map((f) => `fields[]=${encodeURIComponent(f)}`)
    .join("&");
  const path = `${tbl}?filterByFormula=${encodeURIComponent(
    formula
  )}&${fieldsQs}&pageSize=100`;

  const data = await fetchAirtable(path);
  const records: AirtableRecord<Record<string, unknown>>[] = data.records ?? [];

  const productIds = [
    ...new Set(
      records
        .map((r) => firstLinkedId(r.fields[LOT.productLink]))
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const products = await fetchProductsByIds(productIds);

  // 누적 경비 계산 기준일: 이동입고일 우선, 없으면 최초입고일
  const storageMeta = records.map((r) => ({
    storage: String(r.fields[LOT.storage] ?? "").trim(),
    inboundDate:
      String(r.fields[LOT.transferInboundDate] ?? "").trim() ||
      String(r.fields[LOT.firstInboundDate] ?? "").trim(),
  }));
  const storageCosts = await getStorageCostsBatch(storageMeta);

  const cards: LotSearchCard[] = records.map((r, i) => {
    const f = r.fields;
    const lotNumber = String(f[LOT.lotNumber] ?? "").trim();
    const pid = firstLinkedId(f[LOT.productLink]);
    const p = pid ? products.get(pid) : undefined;

    const productName = (p?.name ?? "").trim() || "-";
    const specFromLot = firstNonEmptyString(f, [LOT.spec, "규격"]);
    const specDetailFromLot = firstNonEmptyString(f, [LOT.detailSpec, "상세규격"]);
    const spec = (p?.spec ?? "").trim() || specFromLot || "-";
    const specDetail = (p?.detailSpec ?? "").trim() || specDetailFromLot;
    const specDisplayLine = formatSpecKgMisu(
      spec === "-" ? "" : spec,
      specDetail
    );

    const stockQty = asNumber(f[LOT.stockQty]);
    const stockLineFromLot = firstNonEmptyString(f, [LOT.stockText, "잔여", "잔여수량"]);
    const computedStockLine =
      stockQty != null ? `잔여: ${formatQtyKo(stockQty)}박스` : "잔여: -";
    const stockLine =
      computedStockLine !== "잔여: -" ? computedStockLine : stockLineFromLot || "잔여: -";

    return {
      recordId: r.id,
      lotNumber: lotNumber || "-",
      productName,
      spec,
      specDetail,
      specDisplayLine,
      stockLine,
      pendingApproval: isPendingApproval(f),
      stockQty,
      productRecordId: pid,
      storage: storageMeta[i].storage,
      inboundDate: storageMeta[i].inboundDate,
      storageCost: storageCosts[i],
    };
  });

  const withStock = cards.filter((c) => (c.stockQty ?? 0) > 0);
  withStock.sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "ko"));
  return withStock;
}
