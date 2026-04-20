import { NextResponse } from "next/server";
import Airtable from "airtable";

export async function POST(request: Request) {
  const pat = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!pat || !baseId) {
    return NextResponse.json(
      { success: false, error: "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID" },
      { status: 500 }
    );
  }

  const base = new Airtable({ apiKey: pat }).base(baseId);
  const body = (await request.json()) as {
    amount?: number | string;
    item?: string;
    imageUrl?: string;
    receiptImageUrl?: string;
  };

  const parsedAmount =
    typeof body.amount === "number"
      ? body.amount
      : Number(String(body.amount ?? ""));
  const itemText = String(body.item ?? "").trim();
  const finalImageUrl =
    typeof body.imageUrl === "string" && body.imageUrl.trim()
      ? body.imageUrl.trim()
      : typeof body.receiptImageUrl === "string"
        ? body.receiptImageUrl.trim()
        : "";

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json(
      { success: false, error: "금액이 올바르지 않습니다" },
      { status: 400 }
    );
  }
  if (!itemText) {
    return NextResponse.json(
      { success: false, error: "항목명이 필요합니다" },
      { status: 400 }
    );
  }

  const status = "승인 대기";

  try {
    const fields: Record<string, unknown> = {
      지출일: new Date().toISOString().split("T")[0],
      항목명: itemText,
      금액: parsedAmount,
      결재상태: status,
    };

    if (finalImageUrl) {
      fields["영수증사진"] = [{ url: finalImageUrl }];
    }

    const records = await base("지출결의").create([{ fields } as never]);
    return NextResponse.json({ success: true, id: records[0].id, status });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Airtable 저장 실패" },
      { status: 500 }
    );
  }
}
