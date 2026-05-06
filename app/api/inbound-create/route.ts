import { NextResponse } from "next/server";
import { createInboundLotAndTxn } from "@/lib/inbound-create";
import { withIdempotency } from "@/lib/idempotency";

function isRecordId(s: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(s);
}

export async function POST(request: Request) {
  return withIdempotency(request, async () => {
  try {
    const body = (await request.json()) as {
      workerRecordId?: string;
      productRecordId?: string;
      manualProductName?: string;
      bizDate?: string;
      spec?: string;
      misu?: string;
      qtyBoxes?: number;
      purchasePrice?: number;
      memo?: string;
    };

    const workerRecordId =
      typeof body.workerRecordId === "string"
        ? body.workerRecordId.trim()
        : "";
    const productRecordId =
      typeof body.productRecordId === "string"
        ? body.productRecordId.trim()
        : "";
    const manualProductName =
      typeof body.manualProductName === "string"
        ? body.manualProductName.trim()
        : "";
    const bizDate =
      typeof body.bizDate === "string" ? body.bizDate.trim() : "";
    const spec = typeof body.spec === "string" ? body.spec : "";
    const misu = typeof body.misu === "string" ? body.misu : "";
    const qtyBoxes =
      typeof body.qtyBoxes === "number" ? body.qtyBoxes : NaN;
    const purchasePriceRaw = body.purchasePrice;
    const purchasePrice =
      typeof purchasePriceRaw === "number" &&
      Number.isFinite(purchasePriceRaw) &&
      purchasePriceRaw >= 0
        ? Math.trunc(purchasePriceRaw)
        : undefined;
    const memo =
      typeof body.memo === "string" ? body.memo : "";

    if (!isRecordId(workerRecordId)) {
      return NextResponse.json(
        { error: "Invalid worker record id" },
        { status: 400 }
      );
    }
    if (!isRecordId(productRecordId) && !manualProductName) {
      return NextResponse.json(
        { error: "Either productRecordId or manualProductName is required" },
        { status: 400 }
      );
    }
    if (!bizDate || !/^\d{4}-\d{2}-\d{2}$/.test(bizDate)) {
      return NextResponse.json(
        { error: "bizDate must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(qtyBoxes) || qtyBoxes <= 0) {
      return NextResponse.json(
        { error: "qtyBoxes must be a positive number" },
        { status: 400 }
      );
    }

    const result = await createInboundLotAndTxn({
      workerRecordId,
      productRecordId: productRecordId || undefined,
      productNameManual: productRecordId ? undefined : manualProductName,
      bizDate,
      specInput: spec,
      misuInput: misu,
      qtyBoxes,
      purchasePrice,
      memo,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Inbound LOT create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}

