import { NextResponse } from "next/server";
import { AIRTABLE_TABLE, PRODUCT_FIELDS } from "@/lib/airtable-schema";
import { fetchAirtable, tablePathSegment } from "@/lib/airtable";

function productTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products
  );
}

export async function GET() {
  try {
    const tbl = productTable();
    const fields = [
      PRODUCT_FIELDS.name,
      PRODUCT_FIELDS.spec,
      PRODUCT_FIELDS.detailSpec,
    ];
    const qs = fields
      .map((f) => `fields[]=${encodeURIComponent(f)}`)
      .join("&");
    const data = await fetchAirtable(`${tbl}?${qs}`);
    const records = (data.records ?? []) as {
      id: string;
      fields?: Record<string, unknown>;
    }[];
    const products = records.map((r) => ({
      id: r.id,
      name: String(r.fields?.[PRODUCT_FIELDS.name] ?? "").trim(),
      spec: String(r.fields?.[PRODUCT_FIELDS.spec] ?? "").trim(),
      detailSpec: String(r.fields?.[PRODUCT_FIELDS.detailSpec] ?? "").trim(),
    }));
    return NextResponse.json({ products });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

