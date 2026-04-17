import { NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import { approveOutboundTransaction } from "@/lib/approval-service";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as { transactionId?: string };
    const id =
      typeof body.transactionId === "string" ? body.transactionId.trim() : "";
    if (!id.startsWith("rec")) {
      return NextResponse.json({ error: "transactionId required" }, { status: 400 });
    }
    const result = await approveOutboundTransaction(id);
    return NextResponse.json(result);
  } catch (e) {
    const admin = adminErrorResponse(e);
    if (admin) return admin;
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
