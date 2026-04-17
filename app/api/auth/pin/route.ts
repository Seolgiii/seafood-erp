import { NextResponse } from "next/server";
import { verifyWorkerPin } from "@/lib/airtable";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workerId?: string; pin?: string };
    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    if (!workerId || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: "작업자와 4자리 PIN이 필요합니다" },
        { status: 400 }
      );
    }

    const worker = await verifyWorkerPin(workerId, pin);
    if (!worker) {
      return NextResponse.json({ error: "PIN이 올바르지 않습니다" }, { status: 401 });
    }

    return NextResponse.json({ worker });
  } catch (e) {
    const message = e instanceof Error ? e.message : "인증 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
