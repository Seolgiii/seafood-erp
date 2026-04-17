import { NextResponse } from "next/server";
import { approveOutboundTransaction } from "@/lib/approval-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { transactionId?: string };
    const transactionId =
      typeof body.transactionId === "string" ? body.transactionId.trim() : "";

    if (!/^rec[a-zA-Z0-9]+$/.test(transactionId)) {
      return NextResponse.json(
        { error: "transactionId required" },
        { status: 400 }
      );
    }

    const result = await approveOutboundTransaction(transactionId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message.includes("재고가 부족합니다")) {
      return NextResponse.json({ error: "재고가 부족합니다" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

