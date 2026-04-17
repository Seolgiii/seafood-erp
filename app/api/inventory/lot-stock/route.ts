import { NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

export async function GET() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: "서버 환경 설정 오류" }, { status: 500 });
  }

  const tablePath = encodeURIComponent("LOT별 재고");
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tablePath}`;
  const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

  const allRecords: unknown[] = [];
  let offset: string | undefined;

  // Airtable은 최대 100건씩 반환 — offset으로 전체 페이지 순회
  do {
    const params = new URLSearchParams({
      "sort[0][field]": "LOT번호",
      "sort[0][direction]": "desc",
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const res = await fetch(`${baseUrl}?${params}`, {
      headers,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[lot-stock] Airtable 조회 실패:", res.status, body);
      return NextResponse.json({ error: "데이터 조회 실패" }, { status: 502 });
    }

    const data = await res.json();
    allRecords.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  // 재고 0 이하 LOT 제외
  const records = (allRecords as { id: string; fields: Record<string, unknown> }[]).filter((r) => {
    const raw = r.fields["재고수량"];
    const qty = Number(Array.isArray(raw) ? raw[0] : raw) || 0;
    return qty > 0;
  });

  return NextResponse.json({ records });
}
