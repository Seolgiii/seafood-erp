import { NextResponse } from "next/server";
import { searchLotsBySuffixDigits } from "@/lib/lot-inventory";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q") ?? "";
  const digits = raw.replace(/\D/g, "");

  if (digits.length > 20) {
    return NextResponse.json(
      { error: "Query too long", results: [] as unknown[] },
      { status: 400 }
    );
  }

  try {
    const results = await searchLotsBySuffixDigits(digits);
    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
