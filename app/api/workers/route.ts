import { NextResponse } from "next/server";
import { listActiveWorkers } from "@/lib/airtable";

export async function GET() {
  try {
    const workers = await listActiveWorkers();
    workers.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return NextResponse.json({ workers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "작업자 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
