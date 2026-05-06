import { NextResponse } from "next/server";

/**
 * 진단용: Airtable 베이스의 실제 테이블 목록과 주요 쿼리 결과를 반환합니다.
 * GET /api/debug/airtable-tables
 *
 * 보안: Airtable Base ID, 테이블 구조, 샘플 레코드를 노출하므로 production
 * 환경에서는 항상 404를 반환합니다. 로컬 개발(NODE_ENV !== 'production')에서만
 * 동작합니다.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return NextResponse.json({ error: "AIRTABLE_API_KEY 또는 AIRTABLE_BASE_ID 미설정" }, { status: 500 });
  }

  const result: Record<string, unknown> = {
    baseId,
    tables: null,
    productQuery: null,
    supplierQuery: null,
  };

  // 1. 메타데이터 API로 실제 테이블 목록 조회
  try {
    const metaRes = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" }
    );
    const metaBody = await metaRes.text();
    if (metaRes.ok) {
      const metaData = JSON.parse(metaBody) as { tables?: { id: string; name: string }[] };
      result.tables = metaData.tables?.map((t) => ({ id: t.id, name: t.name })) ?? [];
    } else {
      result.tables = { error: `HTTP ${metaRes.status}`, body: metaBody.slice(0, 500) };
    }
  } catch (e) {
    result.tables = { error: String(e) };
  }

  // 2. 코드에서 사용 중인 테이블명으로 직접 조회 테스트
  const testQueries: Array<{ label: string; tableName: string; field: string }> = [
    { label: "품목마스터(공백없음)", tableName: "품목마스터", field: "품목명" },
    { label: "품목 마스터(공백있음)", tableName: "품목 마스터", field: "품목명" },
    { label: "매입처 마스터(공백있음)", tableName: "매입처 마스터", field: "매입처명" },
    { label: "매입처마스터(공백없음)", tableName: "매입처마스터", field: "매입처명" },
  ];

  const queryResults: Record<string, unknown> = {};
  for (const q of testQueries) {
    try {
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(q.tableName)}?fields[]=${encodeURIComponent(q.field)}&pageSize=3`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });
      const body = await res.text();
      if (res.ok) {
        const data = JSON.parse(body) as { records?: { id: string; fields?: Record<string, unknown> }[] };
        queryResults[q.label] = {
          status: res.status,
          recordCount: data.records?.length ?? 0,
          sample: data.records?.slice(0, 3).map((r) => ({ id: r.id, fields: r.fields })),
        };
      } else {
        queryResults[q.label] = { status: res.status, error: body.slice(0, 300) };
      }
    } catch (e) {
      queryResults[q.label] = { error: String(e) };
    }
  }
  result.productQuery = queryResults;

  // 3. 품목구분 필드명 테스트 (공백 없음 vs 공백 있음)
  const fieldTests: Array<{ label: string; tableName: string; field: string }> = [
    { label: "품목구분(공백없음)", tableName: "품목마스터", field: "품목구분" },
    { label: "품목 구분(공백있음)", tableName: "품목마스터", field: "품목 구분" },
    { label: "품목구분(공백없음/공백테이블)", tableName: "품목 마스터", field: "품목구분" },
    { label: "품목 구분(공백있음/공백테이블)", tableName: "품목 마스터", field: "품목 구분" },
  ];
  const fieldResults: Record<string, unknown> = {};
  for (const q of fieldTests) {
    try {
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(q.tableName)}?fields[]=${encodeURIComponent(q.field)}&pageSize=2`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
      const body = await res.text();
      if (res.ok) {
        const data = JSON.parse(body) as { records?: { fields?: Record<string, unknown> }[] };
        fieldResults[q.label] = {
          status: res.status,
          sample: data.records?.slice(0, 2).map((r) => r.fields),
        };
      } else {
        fieldResults[q.label] = { status: res.status, error: body.slice(0, 200) };
      }
    } catch (e) {
      fieldResults[q.label] = { error: String(e) };
    }
  }
  result.supplierQuery = fieldResults;

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
