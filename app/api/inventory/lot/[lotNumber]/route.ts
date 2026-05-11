import { NextResponse } from "next/server";
import { fetchLotDetailByNumber } from "@/lib/lot-detail";
import { logError } from "@/lib/logger";

/**
 * GET /api/inventory/lot/{LOT번호}
 *
 * QR 스캔/직접 URL 진입 시 LOT 정보를 단건 조회한다.
 * LOT별 재고 + 입고 관리 + 관련 마스터 테이블을 코드 join.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lotNumber: string }> },
) {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json(
      { error: "서버 환경 설정 오류" },
      { status: 500 },
    );
  }

  const { lotNumber: rawParam } = await params;
  const lotNumber = decodeURIComponent(rawParam ?? "").trim();
  if (!lotNumber) {
    return NextResponse.json({ error: "LOT번호 누락" }, { status: 400 });
  }

  try {
    const detail = await fetchLotDetailByNumber(lotNumber);
    if (!detail) {
      return NextResponse.json(
        { error: "LOT을 찾을 수 없습니다.", lotNumber },
        { status: 404 },
      );
    }
    return NextResponse.json(detail);
  } catch (e) {
    logError("[lot-detail] 조회 실패:", e);
    return NextResponse.json({ error: "데이터 조회 실패" }, { status: 502 });
  }
}
