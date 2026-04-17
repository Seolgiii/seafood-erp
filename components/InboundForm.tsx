"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSeoulTodayISO,
  getSeoulTodaySlash,
  tryParseInboundDateInput,
} from "@/lib/inbound-date-input";
import {
  fromGroupedIntegerInput,
  fromGroupedOptionalIntInput,
} from "@/lib/number-format";
import { readSession, touchSession } from "@/lib/session";

const inputClass =
  "min-h-[2.85rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base leading-normal md:min-h-[3.1rem] md:px-3.5 md:py-3 md:text-lg";

const textareaClass =
  "min-h-[4.25rem] w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base leading-normal md:min-h-[4.5rem] md:px-3.5 md:py-3 md:text-lg";

const labelClass =
  "text-sm font-semibold text-slate-700 md:text-base";

const primaryBtnClass =
  "w-full rounded-lg bg-emerald-600 py-3 text-center text-base font-bold text-white shadow-sm active:scale-[0.99] touch-manipulation hover:bg-emerald-700 disabled:opacity-40 md:py-3.5 md:text-lg";

const labelStackClass = "flex flex-col gap-1";

const MEMO_MAX = 8000;

const DATE_ALERT =
  "날짜 형식이 올바르지 않아 오늘 날짜로 설정했습니다.";

function syncDateFromRawInput(
  raw: string,
  setSlash: (s: string) => void,
  showAlert: boolean
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    const slash = getSeoulTodaySlash();
    const iso = getSeoulTodayISO();
    setSlash(slash);
    return iso;
  }
  const p = tryParseInboundDateInput(raw);
  if (p) {
    setSlash(p.slash);
    return p.iso;
  }
  if (showAlert) window.alert(DATE_ALERT);
  const slash = getSeoulTodaySlash();
  const iso = getSeoulTodayISO();
  setSlash(slash);
  return iso;
}

export function InboundForm() {
  const productInputRef = useRef<HTMLInputElement>(null);
  const [bizDateInput, setBizDateInput] = useState(() => getSeoulTodaySlash());
  const [productName, setProductName] = useState("");
  const [spec, setSpec] = useState("");
  const [misu, setMisu] = useState("");
  const [qtyBoxesDisplay, setQtyBoxesDisplay] = useState("");
  const [purchasePriceDisplay, setPurchasePriceDisplay] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    productInputRef.current?.focus();
  }, []);

  const handleDateBlur = useCallback(() => {
    syncDateFromRawInput(bizDateInput, setBizDateInput, true);
  }, [bizDateInput]);

  const submit = async () => {
    const session = readSession();
    if (!session) {
      const m = "로그인이 필요합니다";
      setError(m);
      window.alert(m);
      return;
    }
    const effectiveIso = syncDateFromRawInput(
      bizDateInput,
      setBizDateInput,
      true
    );
    if (!productName.trim()) {
      const m = "품목명을 입력하세요";
      setError(m);
      window.alert(m);
      return;
    }
    if (!effectiveIso || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveIso)) {
      const m = "입고일을 확인하세요";
      setError(m);
      window.alert(m);
      return;
    }
    const n = fromGroupedIntegerInput(qtyBoxesDisplay).value;
    if (!Number.isFinite(n) || n <= 0) {
      const m = "입고 수량(박스)은 1 이상이어야 합니다";
      setError(m);
      window.alert(m);
      return;
    }

    const priceParsed = fromGroupedOptionalIntInput(purchasePriceDisplay);
    const memoTrim = memo.slice(0, MEMO_MAX);

    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const payload: Record<string, unknown> = {
        workerRecordId: session.workerId,
        manualProductName: productName.trim(),
        bizDate: effectiveIso,
        spec,
        misu,
        qtyBoxes: n,
      };
      if (priceParsed.value != null) {
        payload.purchasePrice = priceParsed.value;
      }
      if (memoTrim.trim()) {
        payload.memo = memoTrim.trim();
      }

      const res = await fetch("/api/inbound-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        lotNumber?: string;
      };
      if (!res.ok || !data.ok) {
        const m = data.error ?? "입고 생성에 실패했습니다";
        setError(m);
        window.alert(m);
        return;
      }
      touchSession();
      const msg = data.lotNumber
        ? `입고가 완료되었습니다. LOT: ${data.lotNumber}`
        : "입고가 완료되었습니다";
      setOk(msg);
      window.alert(msg);
      setQtyBoxesDisplay("");
      setPurchasePriceDisplay("");
      setMemo("");
    } catch {
      const m = "입고 처리 중 네트워크 오류가 발생했습니다";
      setError(m);
      window.alert(m);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl rounded-xl border border-slate-300 bg-white p-2.5 shadow-sm md:rounded-2xl md:border-2 md:p-3">
      <h2 className="text-lg font-bold text-slate-900 md:text-xl">
        입고 등록
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500 md:text-base">
        입고일·품목·미수·수량을 입력하면 LOT가 자동 생성됩니다.
      </p>

      <div className="mt-3 grid gap-x-2.5 gap-y-2 md:mt-4 md:grid-cols-2 md:gap-y-2.5">
        <label className={labelStackClass}>
          <span className={labelClass}>입고일</span>
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="YYYY/MM/DD"
            value={bizDateInput}
            onChange={(e) => setBizDateInput(e.target.value)}
            onBlur={handleDateBlur}
            autoComplete="off"
          />
        </label>

        <label className={`${labelStackClass} md:col-span-2`}>
          <span className={labelClass}>품목</span>
          <input
            ref={productInputRef}
            type="text"
            className={`${inputClass} placeholder:text-slate-500/80`}
            placeholder="품목명을 직접 입력하세요"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className={labelStackClass}>
          <span className={labelClass}>규격</span>
          <input
            type="text"
            className={inputClass}
            placeholder="예: 11"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
          />
        </label>

        <label className={labelStackClass}>
          <span className={labelClass}>미수</span>
          <input
            type="text"
            className={inputClass}
            placeholder="예: 42/44"
            value={misu}
            onChange={(e) => setMisu(e.target.value)}
          />
        </label>

        <label className={labelStackClass}>
          <span className={labelClass}>입고 수량 (박스)</span>
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="예: 10"
            value={qtyBoxesDisplay}
            onChange={(e) => {
              const { display } = fromGroupedIntegerInput(e.target.value);
              setQtyBoxesDisplay(display);
            }}
          />
        </label>

        <label className={labelStackClass}>
          <span className={labelClass}>수매가</span>
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="숫자만"
            value={purchasePriceDisplay}
            onChange={(e) => {
              const { display } = fromGroupedOptionalIntInput(e.target.value);
              setPurchasePriceDisplay(display);
            }}
          />
        </label>

        <label className={`${labelStackClass} md:col-span-2`}>
          <span className={labelClass}>비고</span>
          <textarea
            className={textareaClass}
            rows={2}
            maxLength={MEMO_MAX}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 md:text-base">{error}</p>
      )}
      {ok && (
        <p className="mt-2 text-sm font-bold text-emerald-700 md:text-base">
          {ok}
        </p>
      )}

      <div className="mt-2.5 md:mt-3">
        <button
          type="button"
          className={primaryBtnClass}
          disabled={submitting}
          onClick={() => void submit()}
        >
          입고 완료
        </button>
      </div>
    </section>
  );
}
