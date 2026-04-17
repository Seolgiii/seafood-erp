import { NextResponse } from "next/server";
import { receiveInbound } from "@/lib/inbound-airtable";

function isRecordId(s: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(s);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workerRecordId?: string;
      lotRecordId?: string;
      receivedQty?: number;
    };

    const workerRecordId =
      typeof body.workerRecordId === "string" ? body.workerRecordId.trim() : "";
    const lotRecordId =
      typeof body.lotRecordId === "string" ? body.lotRecordId.trim() : "";
    const receivedQty = typeof body.receivedQty === "number" ? body.receivedQty : NaN;

    if (!isRecordId(workerRecordId) || !isRecordId(lotRecordId)) {
      return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
    }
    if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
      return NextResponse.json(
        { error: "receivedQty must be a positive number" },
        { status: 400 }
      );
    }

    const created = await receiveInbound({ workerRecordId, lotRecordId, receivedQty });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Inbound failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

