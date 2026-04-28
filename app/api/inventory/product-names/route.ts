import { NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

export async function GET() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ names: [] });
  }

  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("LOT별 재고")}`;
  const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

  const nameSet = new Set<string>();
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula: "{재고수량} > 0",
      "fields[0]": "품목명",
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const res = await fetch(`${baseUrl}?${params}`, {
      headers,
      next: { revalidate: 60 },
    });

    if (!res.ok) break;

    const data = await res.json();
    for (const record of data.records ?? []) {
      const raw = record.fields["품목명"];
      const name = Array.isArray(raw)
        ? String(raw[0] ?? "").trim()
        : String(raw ?? "").trim();
      if (name) nameSet.add(name);
    }
    offset = data.offset;
  } while (offset);

  const names = Array.from(nameSet).sort((a, b) => a.localeCompare(b, "ko"));
  return NextResponse.json({ names });
}
