import { NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/admin-auth";
import { listPendingOutboundRows } from "@/lib/approval-service";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const rows = await listPendingOutboundRows();
    return NextResponse.json({ rows });
  } catch (e) {
    const admin = adminErrorResponse(e);
    if (admin) return admin;
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
