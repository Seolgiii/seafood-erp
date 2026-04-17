import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 1_000_000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Compressed image must be 1MB or less" },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/\s+/g, "-");
    const blob = await put(`receipts/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
