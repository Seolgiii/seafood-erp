"use server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/**
 * [입고용] 품목 가이드 정보 가져오기
 */
export async function getMasterGuide(itemName: string): Promise<
  | { success: false; records: [] }
  | { success: true; records: { fields: Record<string, unknown> }[]; origin: string; placeholder: string }
> {
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/품목마스터?filterByFormula={품목명}='${itemName}'`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );

    if (!response.ok) return { success: false, records: [] };

    const data = await response.json();
    const records: { fields: Record<string, unknown> }[] = data.records || [];
    const first = records[0];
    if (!first) return { success: false, records: [] };

    const fields = first.fields;
    const origin = String(fields["원산지"] ?? "국내산").trim() || "국내산";
    const detailSpec = String(fields["상세규격_표기"] ?? "").trim();
    const placeholder = detailSpec || (itemName.includes("필렛") ? "예: 쪽 당 사이즈 or 피스" : "예: 42/44미");

    return { success: true, records, origin, placeholder };
  } catch {
    return { success: false, records: [] };
  }
}