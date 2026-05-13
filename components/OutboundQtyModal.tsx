"use client";

import type { LotSearchCard } from "@/lib/inventory-types";
import { readSession, touchSession } from "@/lib/session";
import {
  formatQtyKo,
  fromGroupedQtyInputAllowDecimal,
} from "@/lib/number-format";
import {
  maxOutboundQty,
  planOutboundRequest,
  quickAddPresets,
} from "@/lib/shipment-plan";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast as showToast } from "@/lib/toast";

type Props = {
  card: LotSearchCard | null;
  open: boolean;
  onClose: () => void;
};

const quickBtnClass =
  "min-h-[4.5rem] flex-1 rounded-2xl border-4 border-slate-400 bg-amber-50 px-4 text-2xl font-bold shadow active:scale-[0.99] touch-manipulation hover:bg-amber-100 md:min-h-[5.5rem] md:text-3xl";

const primaryBtnClass =
  "w-full rounded-2xl bg-blue-600 py-7 text-center text-3xl font-bold text-white shadow-lg active:scale-[0.99] touch-manipulation hover:bg-blue-700 disabled:opacity-40 md:py-8 md:text-4xl";

export function OutboundQtyModal({ card, open, onClose }: Props) {
  const router = useRouter();
  const [qty, setQty] = useState(0);
  const [qtyInput, setQtyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !card) return;
    setQty(0);
    setQtyInput("");
    setSubmitErr(null);
    setSubmitOk(false);
    setToast(null);
  }, [open, card]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const plan = useMemo(
    () => (card ? planOutboundRequest(qty, card) : null),
    [card, qty]
  );

  const maxStock = card ? maxOutboundQty(card) : 0;
  const presets = quickAddPresets();

  const formatQtyInput = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return "";
    return formatQtyKo(n);
  };

  const setMax = useCallback(() => {
    if (!card) return;
    setQty(maxStock);
    setQtyInput(formatQtyInput(maxStock));
  }, [card, maxStock]);

  const submit = async () => {
    if (!card || !plan || plan.qtyInInputUnit <= 0) return;
    const session = readSession();
    if (!session) {
      setSubmitErr("로그인이 필요합니다");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/outbound-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          workerRecordId: session.workerId,
          lotRecordId: card.recordId,
          requestedQty: plan.qtyInInputUnit,
          unitLabel: plan.unitLabel,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        const m = data.error ?? "등록 실패";
        setSubmitErr(m);
        showToast(m, "error");
        return;
      }
      if (!data.id) {
        const m = "출고 요청 ID를 찾지 못했습니다";
        setSubmitErr(m);
        showToast(m, "error");
        return;
      }
      const completeRes = await fetch("/api/outbound-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: data.id,
          workerRecordId: session.workerId,
        }),
      });
      const completeData = (await completeRes.json()) as { error?: string };
      if (!completeRes.ok) {
        const m = completeData.error ?? "출고 확정 실패";
        setSubmitErr(m);
        showToast(m, "error");
        return;
      }
      touchSession();
      setSubmitOk(true);
      setToast("출고가 확정(완료)되었습니다");
      router.refresh();
      window.setTimeout(() => {
        onClose();
      }, 800);
    } catch {
      const m = "네트워크 오류";
      setSubmitErr(m);
      showToast(m, "error");
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
      aria-label="출고 수량"
    >
      {toast && (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[70] max-w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border-4 border-emerald-600 bg-emerald-50 px-6 py-4 text-center text-2xl font-bold text-emerald-900 shadow-xl md:text-3xl"
          role="status"
        >
          {toast}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b-4 border-slate-300 bg-white px-5 py-5 md:px-8 md:py-6">
          <div className="min-w-0">
            <p className="text-2xl text-slate-500 md:text-3xl">
              LOT {card.lotNumber}
            </p>
            <h2 className="truncate text-3xl font-bold text-slate-900 md:text-4xl">
              {card.productName}
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
          <h3 className="text-3xl font-bold text-slate-900 md:text-4xl">
            출고 수량 입력
          </h3>

          <p className="mt-6 text-2xl text-slate-600 md:text-3xl">
            현재 박스 재고:{" "}
            <span className="font-bold text-slate-900">
              {maxStock.toLocaleString("ko-KR", {
                maximumFractionDigits: 3,
              })}{" "}
              박스
            </span>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 md:gap-4">
            <span className="text-3xl font-semibold text-slate-700 md:text-4xl">
              수량
            </span>
            <input
              type="text"
              inputMode="numeric"
              className="w-40 rounded-2xl border-4 border-slate-400 bg-white px-4 py-3 text-4xl font-bold md:w-48 md:text-5xl"
              value={qtyInput}
              placeholder="0"
              onChange={(e) => {
                const { display, value } = fromGroupedQtyInputAllowDecimal(
                  e.target.value
                );
                setQtyInput(display);
                setQty(value);
              }}
            />
            <span className="text-3xl font-bold md:text-4xl">박스</span>
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

          {submitErr && (
            <p className="mt-4 text-2xl text-red-600 md:text-3xl">
              {submitErr}
            </p>
          )}
          {submitOk && (
            <p className="mt-4 text-2xl font-bold text-emerald-700 md:text-3xl">
              출고 확정 처리됨
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t-4 border-slate-300 bg-white px-4 py-5 md:px-8 md:py-6">
          <p className="mb-3 text-center text-2xl font-semibold text-slate-600 md:text-3xl">
            간편 추가
          </p>
          <div className="flex flex-wrap gap-3 md:gap-4">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={quickBtnClass}
                onClick={() =>
                  setQty((q) => {
                    const next = q + p.delta;
                    setQtyInput(formatQtyInput(next));
                    return next;
                  })
                }
              >
                +{p.label}
              </button>
            ))}
            <button
              type="button"
              className={`${quickBtnClass} border-violet-500 bg-violet-50`}
              onClick={setMax}
            >
              전량
            </button>
          </div>

          <button
            type="button"
            className={`${primaryBtnClass} mt-6`}
            disabled={
              submitting ||
              !plan ||
              !plan.unitLabel.trim() ||
              plan.qtyInInputUnit <= 0 ||
              submitOk
            }
            onClick={() => void submit()}
          >
            출고 확정(완료)
          </button>
        </footer>
      </div>
    </div>
  );
}
