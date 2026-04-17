"use client";

import type { LotSearchCard } from "@/lib/inventory-types";
import { OutboundQtyModal } from "@/components/OutboundQtyModal";
import { InboundQtyModal } from "@/components/InboundQtyModal";
import { useCallback, useEffect, useState } from "react";

const inputClass =
  "w-full rounded-2xl border-4 border-slate-400 bg-white px-6 py-6 text-4xl font-semibold tracking-wider shadow-inner outline-none ring-slate-300 focus:border-sky-500 focus:ring-4 md:py-7 md:text-5xl";

const cardBtnClass =
  "w-full cursor-pointer rounded-3xl border-4 border-slate-300 bg-white p-8 text-left shadow-lg transition hover:border-sky-400 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-300 md:p-10";

export type MainMode = "outbound" | "inbound";

export function LotInventorySearch({ mode }: { mode: MainMode }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<LotSearchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<LotSearchCard | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  const runSearch = useCallback(async (digits: string) => {
    const q = digits.replace(/\D/g, "");
    if (!q.length) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inventory/search?q=${encodeURIComponent(q)}`
      );
      const data = (await res.json()) as {
        results?: LotSearchCard[];
        error?: string;
      };
      if (!res.ok) {
        setResults([]);
        setError(data.error ?? "검색 실패");
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setResults([]);
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(debounced);
  }, [debounced, runSearch]);

  return (
    <section className="mx-auto w-full max-w-4xl">
      <label className="block">
        <span className="mb-2 block text-center text-2xl font-bold text-slate-800 md:mb-4 md:text-4xl">
          LOT 뒷자리 검색
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="숫자만 입력"
          className={inputClass}
          value={query}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setQuery(v);
          }}
        />
      </label>

      {loading && (
        <p className="mt-4 text-center text-xl text-slate-500 md:mt-8 md:text-4xl">
          검색 중…
        </p>
      )}
      {error && (
        <p className="mt-4 text-center text-xl text-red-600 md:mt-8 md:text-4xl">
          {error}
        </p>
      )}

      {mode === "outbound" ? (
        <OutboundQtyModal
          card={modalCard}
          open={modalCard != null}
          onClose={() => setModalCard(null)}
        />
      ) : (
        <InboundQtyModal
          card={modalCard}
          open={modalCard != null}
          onClose={() => setModalCard(null)}
        />
      )}

      <ul className="mt-4 flex flex-col gap-4 md:mt-10 md:gap-8">
        {!loading &&
          debounced.replace(/\D/g, "").length > 0 &&
          results.length === 0 &&
          !error && (
            <li className="rounded-3xl border-4 border-dashed border-slate-300 bg-white/80 px-8 py-12 text-center text-3xl text-slate-500 md:text-4xl">
              결과가 없습니다
            </li>
          )}

        {results.map((item) => (
          <li key={item.recordId}>
            <button
              type="button"
              className={cardBtnClass}
              onClick={() => setModalCard(item)}
            >
              {item.pendingApproval && (
                <p className="mb-6 rounded-2xl border-4 border-red-500 bg-red-50 px-5 py-4 text-2xl font-bold text-red-700 md:text-3xl">
                  ⚠️ 승인 대기 중인 물량이 포함되어 있습니다
                </p>
              )}

              <p className="text-2xl font-medium text-slate-500 md:text-3xl">
                LOT {item.lotNumber}
              </p>
              <h2 className="mt-3 text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
                {item.productName}
              </h2>
              <p className="mt-5 text-3xl font-semibold text-sky-900 md:text-4xl">
                <span className="text-slate-600">규격 </span>
                {item.specDisplayLine}
              </p>
              <p className="mt-6 text-3xl font-bold text-emerald-800 md:text-4xl">
                {item.stockLine}
              </p>
              <p className="mt-6 text-2xl font-semibold text-sky-600 md:text-3xl">
                {mode === "outbound" ? "탭하여 출고 입력" : "탭하여 입고 입력"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
