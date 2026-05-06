"use client";

import type { LotSearchCard } from "@/lib/inventory-types";
import { fromGroupedIntegerInput } from "@/lib/number-format";
import { readSession, touchSession } from "@/lib/session";
import { defaultInputMode } from "@/lib/shipment-plan";
import { toast } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";

type Props = {
  card: LotSearchCard | null;
  open: boolean;
  onClose: () => void;
};

const primaryBtnClass =
  "w-full rounded-2xl bg-emerald-600 py-7 text-center text-3xl font-bold text-white shadow-lg active:scale-[0.99] touch-manipulation hover:bg-emerald-700 disabled:opacity-40 md:py-8 md:text-4xl";

export function InboundQtyModal({ card, open, onClose }: Props) {
  const [qtyInput, setQtyInput] = useState("");
  const [qty, setQty] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open || !card) return;
    // 원물/PBO 판단은 서버에서 처리하지만, UX상 박스 입력이 기본
    defaultInputMode(card); // keep behavior consistent
    setQtyInput("");
    setQty(0);
    setErr(null);
    setOk(false);
  }, [open, card]);

  const unitLabel = useMemo(() => (card ? card.baseUnitLabel.trim() : ""), [card]);
  const specDetail = card?.specDetail.trim() ?? "";

  const submit = async () => {
    if (!card || qty <= 0) return;
    const session = readSession();
    if (!session) {
      const m = "로그인이 필요합니다";
      setErr(m);
      toast(m, "error");
      return;
    }
    if (!unitLabel) {
      const m = "기준단위(박스) 라벨이 없어 입고를 처리할 수 없습니다.";
      setErr(m);
      toast(m, "error");
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/inbound-receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerRecordId: session.workerId,
          lotRecordId: card.recordId,
          receivedQty: qty,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        const m = data.error ?? "입고 등록 실패";
        setErr(m);
        toast(m, "error");
        return;
      }
      touchSession();
      setOk(true);
      window.setTimeout(() => onClose(), 650);
    } catch {
      const m = "네트워크 오류";
      setErr(m);
      toast(m, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !card) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/60 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="입고 수량"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b-4 border-slate-300 bg-white px-5 py-5 md:px-8 md:py-6">
          <div className="min-w-0">
            <p className="text-2xl text-slate-500 md:text-3xl">LOT {card.lotNumber}</p>
            <h2 className="truncate text-3xl font-bold text-slate-900 md:text-4xl">
              {card.productName}
              {specDetail ? ` (${specDetail}미)` : ""}
            </h2>
            <p className="mt-2 text-2xl text-sky-900 md:text-3xl">
              규격 {card.specDisplayLine}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-2xl border-4 border-slate-300 bg-white px-5 py-4 text-2xl font-semibold text-slate-700 md:text-3xl"
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <h3 className="text-3xl font-bold text-slate-900 md:text-4xl">입고 수량 입력</h3>
          <p className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-2xl font-semibold text-emerald-900 md:text-3xl">
            박스(기준단위) 수량을 입력하세요.
          </p>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-slate-700 md:text-4xl">수량</span>
            <input
              type="text"
              inputMode="numeric"
              className="w-full max-w-xs rounded-2xl border-4 border-slate-400 bg-white px-4 py-4 text-4xl font-bold md:text-5xl"
              value={qtyInput}
              placeholder="0"
              onChange={(e) => {
                const { display, value } = fromGroupedIntegerInput(
                  e.target.value
                );
                setQtyInput(display);
                setQty(value);
              }}
            />
            {unitLabel ? (
              <span className="text-3xl font-bold md:text-4xl">{unitLabel}</span>
            ) : null}
            <button
              type="button"
              className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-xl font-semibold text-slate-700 hover:bg-slate-50 md:text-2xl"
              onClick={() => {
                setQty(0);
                setQtyInput("");
              }}
            >
              초기화
            </button>
          </div>

          {err && <p className="mt-4 text-2xl text-red-600 md:text-3xl">{err}</p>}
          {ok && (
            <p className="mt-4 text-2xl font-bold text-emerald-700 md:text-3xl">
              입고가 등록되었습니다
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t-4 border-slate-300 bg-white px-4 py-5 md:px-8 md:py-6">
          <button
            type="button"
            className={primaryBtnClass}
            disabled={submitting || qty <= 0 || ok}
            onClick={() => void submit()}
          >
            입고 등록
          </button>
        </footer>
      </div>
    </div>
  );
}

