import { NextResponse } from "next/server";
import { createOutboundPendingRecord } from "@/lib/outbound-airtable";

function isRecordId(s: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(s);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workerRecordId?: string;
      lotRecordId?: string;
      requestedQty?: number;
      unitLabel?: string;
      yieldVarianceDetail?: number;
    };

    const workerRecordId =
      typeof body.workerRecordId === "string" ? body.workerRecordId.trim() : "";
    const lotRecordId =
      typeof body.lotRecordId === "string" ? body.lotRecordId.trim() : "";
    const unitLabel =
      typeof body.unitLabel === "string" ? body.unitLabel.trim() : "";
    const requestedQty =
      typeof body.requestedQty === "number" ? body.requestedQty : NaN;
    const yieldVarianceDetail =
      typeof body.yieldVarianceDetail === "number"
        ? body.yieldVarianceDetail
        : 0;

    if (!isRecordId(workerRecordId) || !isRecordId(lotRecordId)) {
      return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
    }
    if (!unitLabel) {
      return NextResponse.json({ error: "unitLabel required" }, { status: 400 });
    }
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      return NextResponse.json(
        { error: "requestedQty must be a positive number" },
        { status: 400 }
      );
    }

    const created = await createOutboundPendingRecord({
      workerRecordId,
      lotRecordId,
      requestedQty,
      unitLabel,
      yieldVarianceDetail,
    });

    return NextResponse.json({ id: created.id, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
