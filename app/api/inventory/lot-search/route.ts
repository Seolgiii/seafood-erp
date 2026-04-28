import { NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** IFERROR로 감싸 없는 필드가 있어도 formula 에러 방지 */
function safe(field: string): string {
  return `IFERROR({${field}},'')`;
}

export async function GET(request: Request) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: "서버 환경 설정 오류" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const q    = searchParams.get("q")?.trim()    ?? "";
  const spec = searchParams.get("spec")?.trim() ?? "";
  const misu = searchParams.get("misu")?.trim() ?? "";
  const from = searchParams.get("from")?.trim() ?? "";
  const to   = searchParams.get("to")?.trim()   ?? "";

  const conditions: string[] = ["{재고수량} > 0"];

  if (q)    conditions.push(`FIND('${esc(q)}', {품목명})`);
  if (spec) conditions.push(`OR(FIND('${esc(spec)}', ${safe("규격표시")}), FIND('${esc(spec)}', ${safe("규격")}))`);
  if (misu) conditions.push(`OR(FIND('${esc(misu)}', ${safe("상세규격_표기")}), FIND('${esc(misu)}', ${safe("미수")}))`);
  if (from) conditions.push(`NOT(IS_BEFORE({입고일자}, '${from}'))`);
  if (to)   conditions.push(`NOT(IS_AFTER({입고일자}, '${to}'))`);

  const formula =
    conditions.length === 1 ? conditions[0] : `AND(${conditions.join(",")})`;

  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("LOT별 재고")}`;
  const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

  const allRecords: unknown[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula: formula,
      "sort[0][field]": "LOT번호",
      "sort[0][direction]": "asc",
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const res = await fetch(`${baseUrl}?${params}`, {
      headers,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[lot-search] Airtable 조회 실패:", res.status, body);
      // formula 오류(422)나 기타 에러는 빈 결과로 내려줘 클라이언트 alert 방지
      if (res.status === 422) {
        return NextResponse.json({ records: [] });
      }
      return NextResponse.json({ error: "데이터 조회 실패" }, { status: 502 });
    }

    const data = await res.json();
    allRecords.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return NextResponse.json({ records: allRecords });
}
