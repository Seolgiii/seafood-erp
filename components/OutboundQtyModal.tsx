"use client";

import type { LotSearchCard, ShipmentInputMode } from "@/lib/inventory-types";
import { readSession, touchSession } from "@/lib/session";
import {
  formatQtyKo,
  fromGroupedQtyInputAllowDecimal,
} from "@/lib/number-format";
import {
  canonicalDetailTotal,
  defaultInputMode,
  detailToInputQty,
  planOutboundRequest,
  quickAddPresets,
} from "@/lib/shipment-plan";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  card: LotSearchCard | null;
  open: boolean;
  onClose: () => void;
};

const quickBtnClass =
  "min-h-[4.5rem] flex-1 rounded-2xl border-4 border-slate-400 bg-amber-50 px-4 text-2xl font-bold shadow active:scale-[0.99] touch-manipulation hover:bg-amber-100 md:min-h-[5.5rem] md:text-3xl";

const primaryBtnClass =
  "w-full rounded-2xl bg-blue-600 py-7 text-center text-3xl font-bold text-white shadow-lg active:scale-[0.99] touch-manipulation hover:bg-blue-700 disabled:opacity-40 md:py-8 md:text-4xl";

const modeBtnOn =
  "flex-1 rounded-2xl border-4 border-blue-600 bg-blue-100 py-5 text-2xl font-bold text-blue-900 md:py-6 md:text-3xl";
const modeBtnOff =
  "flex-1 rounded-2xl border-4 border-slate-300 bg-white py-5 text-2xl font-semibold text-slate-700 md:py-6 md:text-3xl";

export function OutboundQtyModal({ card, open, onClose }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ShipmentInputMode>("detail");
  const [qty, setQty] = useState(0);
  const [qtyInput, setQtyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !card) return;
    setMode(defaultInputMode(card));
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
    () => (card ? planOutboundRequest(qty, mode, card) : null),
    [card, qty, mode]
  );

  const maxDetail = card ? canonicalDetailTotal(card) : 0;
  const presets = card ? quickAddPresets(mode, card) : [];

  const formatQtyInput = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return "";
    return formatQtyKo(n);
  };

  const setMax = useCallback(() => {
    if (!card) return;
    const next = detailToInputQty(maxDetail, mode, card);
    setQty(next);
    setQtyInput(formatQtyInput(next));
  }, [card, mode, maxDetail]);

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
      const res = await fetch("/api/outbound-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerRecordId: session.workerId,
          lotRecordId: card.recordId,
          requestedQty: plan.qtyInInputUnit,
          unitLabel: plan.unitLabel,
          yieldVarianceDetail: plan.yieldVarianceDetail,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        const m = data.error ?? "등록 실패";
        setSubmitErr(m);
        window.alert(m);
        return;
      }
      if (!data.id) {
        const m = "출고 요청 ID를 찾지 못했습니다";
        setSubmitErr(m);
        window.alert(m);
        return;
      }
      const completeRes = await fetch("/api/outbound-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: data.id }),
      });
      const completeData = (await completeRes.json()) as { error?: string };
      if (!completeRes.ok) {
        const m = completeData.error ?? "출고 확정 실패";
        setSubmitErr(m);
        window.alert(m);
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
      window.alert(m);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !card) return null;

  const dual =
    card.detailPerBase != null &&
    card.detailPerBase > 0 &&
    card.baseUnitLabel.trim() &&
    card.detailUnitLabel.trim();
  const isPbo = card.detailPerBase != null && card.detailPerBase > 0;
  const activeUnitLabel =
    mode === "base" ? card.baseUnitLabel.trim() : card.detailUnitLabel.trim();
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

          {dual && (
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className={mode === "base" ? modeBtnOn : modeBtnOff}
                onClick={() => setMode("base")}
              >
                {card.baseUnitLabel.trim()}
              </button>
              <button
                type="button"
                className={mode === "detail" ? modeBtnOn : modeBtnOff}
                onClick={() => setMode("detail")}
              >
                {card.detailUnitLabel.trim()}
              </button>
            </div>
          )}

          {!isPbo && card.baseUnitLabel.trim() && (
            <p className="mt-5 rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-2xl font-semibold text-blue-900 md:text-3xl">
              원물 출고: 박스 수량만 입력됩니다.
            </p>
          )}

          {isPbo ? (
            <p className="mt-6 text-2xl text-slate-600 md:text-3xl">
              현재 합산(상세 환산):{" "}
              <span className="font-bold text-slate-900">
                {maxDetail.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}{" "}
                {card.detailUnitLabel.trim()}
              </span>
            </p>
          ) : (
            <p className="mt-6 text-2xl text-slate-600 md:text-3xl">
              현재 박스 재고:{" "}
              <span className="font-bold text-slate-900">
                {(card.qtyBase ?? 0).toLocaleString("ko-KR", {
                  maximumFractionDigits: 3,
                })}{" "}
                {card.baseUnitLabel.trim()}
              </span>
            </p>
          )}

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
            {activeUnitLabel ? (
              <span className="text-3xl font-bold md:text-4xl">
                {activeUnitLabel}
              </span>
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

          {plan && plan.yieldVarianceDetail !== 0 && (
            <p className="mt-5 rounded-2xl border-4 border-amber-500 bg-amber-50 px-4 py-4 text-2xl font-bold text-amber-900 md:text-3xl">
              수율 오차(Yield Variance) 자동 보정:{" "}
              {plan.yieldVarianceDetail > 0 ? "+" : ""}
              {plan.yieldVarianceDetail.toLocaleString("ko-KR", {
                maximumFractionDigits: 3,
              })}{" "}
              {card.detailUnitLabel.trim() || ""} (전체 소진 스냅)
            </p>
          )}

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
