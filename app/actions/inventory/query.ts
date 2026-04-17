"use server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/**
 * [입고용] 품목 가이드 정보 가져오기
 */
export async function getMasterGuide(itemName: string) {
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/품목마스터?filterByFormula={품목명}='${itemName}'`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );

    if (!response.ok) return { success: false, records: [] };

    const data = await response.json();
    return { success: true, records: data.records || [] };
  } catch (error) {
    return { success: false, records: [] };
  }
}