'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  XMarkIcon,
  ArrowsRightLeftIcon,
  ArrowUpOnSquareIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { BulkSubmitSheet } from '@/components/BulkSubmitSheet';
import { toast } from '@/lib/toast';
import { readSession } from '@/lib/session';
import {
  createOutboundRecord,
  createTransferRecord,
  getStorageOptions,
} from '@/app/actions';

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

type Stage = 'form' | 'results' | 'summary';

type LotRecord = {
  id: string;
  lotNumber: string;
  productName: string;
  spec: string;      // e.g. "11" (kg per box)
  misu: string;      // e.g. "42/44"
  stockQty: number;  // boxes
  salePrice: number; // 원/kg
};

type Filters = { q: string; spec: string; misu: string; from: string; to: string };

function parseLot(r: { id: string; fields: Record<string, unknown> }): LotRecord {
  const f = r.fields;
  const str = (v: unknown) =>
    Array.isArray(v) ? String(v[0] ?? '').trim() : String(v ?? '').trim();
  return {
    id: r.id,
    lotNumber: str(f['LOT번호']),
    productName: str(f['품목명']),
    spec: str(f['규격표시']) || str(f['규격']),
    misu: str(f['상세규격_표기']) || str(f['미수']),
    stockQty: Number(Array.isArray(f['재고수량']) ? f['재고수량'][0] : f['재고수량']) || 0,
    salePrice: Number(f['판매원가']) || 0,
  };
}

function calcAmount(lot: LotRecord, boxes: number): number {
  const kg = parseFloat(lot.spec);
  if (!Number.isFinite(kg) || kg <= 0 || !lot.salePrice) return 0;
  return Math.round(boxes * kg * lot.salePrice);
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[12px] font-bold whitespace-nowrap">
      {label}
    </span>
  );
}

export default function StockStatusPage() {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [lots, setLots] = useState<LotRecord[]>([]);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>({ q: '', spec: '', misu: '', from: '', to: '' });
  const [applied, setApplied] = useState<Filters | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 품목명 자동완성
  const [productNames, setProductNames] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 묶음 출고/이동 바텀시트
  const [workerId, setWorkerId] = useState('');
  const [storageOptions, setStorageOptions] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [outboundOpen, setOutboundOpen] = useState(false);
  const [seller, setSeller] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [outboundDate, setOutboundDate] = useState(todayKST());

  const [transferOpen, setTransferOpen] = useState(false);
  const [targetStorageId, setTargetStorageId] = useState('');
  const [transferDate, setTransferDate] = useState(todayKST());

  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  useEffect(() => {
    getStorageOptions().then(setStorageOptions).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/inventory/product-names')
      .then((r) => r.json())
      .then((d) => setProductNames(d.names ?? []))
      .catch(() => {});
  }, []);

  const filteredNames = filters.q.trim().length > 0
    ? productNames.filter((n) => n.includes(filters.q.trim())).slice(0, 8)
    : [];

  const canSearch =
    filters.q.trim() || filters.spec.trim() || filters.misu.trim() || filters.from || filters.to;

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    setIsLoading(true);
    setNotFound(false);
    try {
      const p = new URLSearchParams();
      if (filters.q.trim())    p.set('q',    filters.q.trim());
      if (filters.spec.trim()) p.set('spec', filters.spec.trim());
      if (filters.misu.trim()) p.set('misu', filters.misu.trim());
      if (filters.from)        p.set('from', filters.from);
      if (filters.to)          p.set('to',   filters.to);

      const res = await fetch(`/api/inventory/lot-search?${p}`);
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const data = await res.json();
      const records = (data.records ?? []).map(parseLot) as LotRecord[];

      if (records.length === 0) {
        setNotFound(true);
        return; // 폼 유지
      }

      setLots(records);
      setSelectedQty({});
      setApplied({ ...filters });
      setStage('results');
    } catch {
      toast('서버와 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, canSearch]);

  const handleQtyChange = (id: string, value: string, max: number) => {
    const n = parseInt(value, 10);
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (isNaN(n) || n <= 0) {
        delete next[id];
      } else {
        next[id] = Math.min(n, max);
      }
      return next;
    });
  };

  const selectedLots = lots.filter((l) => (selectedQty[l.id] ?? 0) > 0);
  const totalBoxes   = selectedLots.reduce((s, l) => s + (selectedQty[l.id] ?? 0), 0);
  const totalAmount  = selectedLots.reduce((s, l) => s + calcAmount(l, selectedQty[l.id] ?? 0), 0);

  const openOutboundSheet = () => {
    if (selectedLots.length === 0) return;
    setSeller('');
    setSalePrice('');
    setOutboundDate(todayKST());
    setOutboundOpen(true);
  };

  const openTransferSheet = () => {
    if (selectedLots.length === 0) return;
    setTargetStorageId('');
    setTransferDate(todayKST());
    setTransferOpen(true);
  };

  const handleBulkOutbound = async () => {
    if (!workerId) { toast('로그인 정보를 확인해주세요.'); return; }
    if (!seller.trim()) { toast('판매처를 입력해주세요.'); return; }
    if (!salePrice.trim() || Number(salePrice) <= 0) { toast('판매가를 올바르게 입력해주세요.'); return; }
    if (!outboundDate) { toast('출고일을 입력해주세요.'); return; }

    setSubmitting(true);
    for (const lot of selectedLots) {
      const qty = selectedQty[lot.id] ?? 0;
      const result = await createOutboundRecord({
        date: outboundDate,
        lotNumber: lot.lotNumber,
        lotRecordId: lot.id,
        quantity: qty,
        workerRecordId: workerId,
        spec: lot.spec,
        misu: lot.misu,
        seller: seller.trim(),
        salePrice: Number(salePrice),
      });
      if (!result.success) {
        setSubmitting(false);
        toast(`출고 신청 실패 (${lot.lotNumber}): ${result.error ?? '오류'}`);
        return;
      }
    }
    setSubmitting(false);
    setOutboundOpen(false);
    toast(`${selectedLots.length}건 출고 신청이 완료되었습니다.`, 'success');
    router.push('/');
  };

  const handleBulkTransfer = async () => {
    if (!workerId) { toast('로그인 정보를 확인해주세요.'); return; }
    if (!targetStorageId) { toast('이동 후 보관처를 선택해주세요.'); return; }
    if (!transferDate) { toast('이동일을 입력해주세요.'); return; }

    setSubmitting(true);
    for (const lot of selectedLots) {
      const qty = selectedQty[lot.id] ?? 0;
      const result = await createTransferRecord({
        lotRecordId: lot.id,
        이동수량: qty,
        이동후보관처RecordId: targetStorageId,
        이동일: transferDate,
        workerId,
      });
      if (!result.success) {
        setSubmitting(false);
        toast(`이동 신청 실패 (${lot.lotNumber}): ${result.message ?? '오류'}`);
        return;
      }
    }
    setSubmitting(false);
    setTransferOpen(false);
    toast(`${selectedLots.length}건 재고 이동이 완료되었습니다.`, 'success');
    router.push('/');
  };

  /* ── 1단계: 검색 폼 ──────────────────────────────────────────────── */
  if (stage === 'form') {
    return (
      <main
        className="min-h-screen bg-[#F2F4F6]"
        style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
      >
        <PageHeader title="재고 조회" onBack={() => router.push('/')} />

        <div className="pt-3 px-5 pb-5 space-y-3">
          <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_24px_rgba(149,157,165,0.08)] space-y-4">

            {/* 품목명 — 자동완성 */}
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-gray-500">품목명</label>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  placeholder="예: 연어 필렛"
                  value={filters.q}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, q: e.target.value }));
                    setNotFound(false);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { setShowDropdown(false); handleSearch(); }
                    if (e.key === 'Escape') setShowDropdown(false);
                  }}
                  className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                {showDropdown && filteredNames.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 bg-white rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden border border-gray-100 max-h-52 overflow-y-auto">
                    {filteredNames.map((name) => (
                      <li
                        key={name}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFilters((f) => ({ ...f, q: name }));
                          setShowDropdown(false);
                          setNotFound(false);
                        }}
                        className="px-4 py-3 text-[14px] font-bold text-gray-800 hover:bg-blue-50 active:bg-blue-100 cursor-pointer"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 규격 + 미수 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-500">규격</label>
                <input
                  type="text"
                  placeholder="예: 11"
                  value={filters.spec}
                  onChange={(e) => { setFilters((f) => ({ ...f, spec: e.target.value })); setNotFound(false); }}
                  className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-500">미수</label>
                <input
                  type="text"
                  placeholder="예: 42/44"
                  value={filters.misu}
                  onChange={(e) => { setFilters((f) => ({ ...f, misu: e.target.value })); setNotFound(false); }}
                  className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* 입고기간 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-gray-500">입고기간</label>
                <button
                  type="button"
                  onClick={() => { setFilters((f) => ({ ...f, from: '', to: '' })); setNotFound(false); }}
                  className={`text-[12px] font-bold px-3 py-1 rounded-full transition-colors ${
                    !filters.from && !filters.to
                      ? 'bg-[#3182F6] text-white'
                      : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                  }`}
                >
                  전체
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); setNotFound(false); }}
                  className="flex-1 bg-gray-100 rounded-2xl px-4 py-3.5 text-[14px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <span className="text-gray-400 font-bold shrink-0">~</span>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); setNotFound(false); }}
                  className="flex-1 bg-gray-100 rounded-2xl px-4 py-3.5 text-[14px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              {!filters.from && !filters.to && (
                <p className="text-[12px] font-bold text-[#3182F6] flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  전체 기간으로 조회됩니다
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!canSearch || isLoading}
            className="w-full py-4 rounded-[20px] bg-blue-600 text-white text-[16px] font-black shadow-[0_4px_16px_rgba(59,130,246,0.3)] active:scale-[0.98] transition-all disabled:opacity-40"
          >
            {isLoading ? '조회 중...' : '조회하기'}
          </button>

          {/* 결과 없음 인라인 메시지 */}
          {notFound && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-center">
              <p className="text-[14px] font-bold text-amber-700">일치하는 재고가 없습니다</p>
              <p className="text-[12px] text-amber-500 mt-1">검색 조건을 바꿔서 다시 시도해보세요</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ── 2단계: 결과 리스트 ──────────────────────────────────────────── */
  if (stage === 'results') {
    return (
      <main
        className="min-h-screen bg-[#F2F4F6] pb-36"
        style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
      >
        <PageHeader
          title="재고 조회"
          onBack={() => setStage('form')}
          rightSlot={
            <button
              onClick={() => { setStage('form'); setLots([]); setSelectedQty({}); }}
              className="text-[13px] font-bold text-blue-600"
            >
              재검색
            </button>
          }
        />

        {/* 적용된 검색 조건 칩 */}
        <div className="px-5 pt-3 pb-1 flex flex-wrap gap-2">
          {applied?.q    && <FilterChip label={applied.q} />}
          {applied?.spec && <FilterChip label={`규격 ${applied.spec}kg`} />}
          {applied?.misu && <FilterChip label={`${applied.misu}미`} />}
          {applied?.from || applied?.to ? (
            <FilterChip label={`${applied.from || '—'} ~ ${applied.to || '—'}`} />
          ) : (
            <FilterChip label="기간 전체" />
          )}
        </div>

        <p className="px-5 py-2 text-[13px] font-bold text-gray-400">{lots.length}개 LOT</p>

        {/* LOT 카드 */}
        <div className="px-5 space-y-3">
          {lots.map((lot) => {
            const selected = selectedQty[lot.id] ?? 0;
            const isFull = lot.stockQty > 0 && selected === lot.stockQty;
            const isPartial = selected > 0 && selected < lot.stockQty;
            const toggleFull = () => {
              setSelectedQty((p) => ({
                ...p,
                [lot.id]: isFull ? 0 : lot.stockQty,
              }));
            };
            return (
              <div
                key={lot.id}
                className={`bg-white rounded-[20px] px-4 py-3.5 shadow-[0_4px_12px_rgba(149,157,165,0.06)] space-y-3 transition-all ${
                  selected > 0 ? 'ring-2 ring-blue-400' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[16px] font-black text-blue-500 tracking-tight break-all leading-tight flex-1 min-w-0">
                    {lot.lotNumber || '—'}
                  </p>
                  <button
                    type="button"
                    onClick={toggleFull}
                    disabled={lot.stockQty === 0}
                    aria-label={isFull ? '전체 선택 해제' : '풀 수량 선택'}
                    aria-pressed={isFull}
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all touch-manipulation disabled:opacity-30 ${
                      isFull
                        ? 'bg-blue-600 text-white shadow-sm'
                        : isPartial
                        ? 'bg-blue-50 border-2 border-blue-400'
                        : 'bg-gray-100 border-2 border-gray-200 active:bg-gray-200'
                    }`}
                  >
                    {isFull ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isPartial ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    ) : null}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 leading-tight">
                    <p className="text-[16px] font-black text-gray-900 truncate">
                      {lot.productName || '—'}
                    </p>
                    <p className="text-[13px] text-gray-500 mt-0.5">
                      {lot.spec ? `${lot.spec}kg` : '—'} · {lot.misu ? `${lot.misu}미` : '—'}
                    </p>
                  </div>
                  {lot.salePrice > 0 && (
                    <p className="text-[17px] font-black text-gray-900 shrink-0 leading-tight">
                      {Math.round(lot.salePrice).toLocaleString('ko-KR')}원/kg
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-3 flex items-center justify-end gap-2">
                  <span className="text-[16px] font-black text-blue-600 shrink-0 whitespace-nowrap">
                    {lot.stockQty.toLocaleString('ko-KR')}박스 중
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={lot.stockQty}
                    value={selected || ''}
                    onChange={(e) => handleQtyChange(lot.id, e.target.value, lot.stockQty)}
                    placeholder="0"
                    className="w-20 text-right bg-gray-100 rounded-xl px-3 py-2.5 font-black text-[16px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 고정 바 */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-5 py-4"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-gray-400">선택</p>
              <p className="text-[20px] font-black text-blue-600 leading-tight">
                {totalBoxes.toLocaleString('ko-KR')}박스
              </p>
              {totalAmount > 0 && (
                <p className="text-[12px] text-gray-500">
                  {totalAmount.toLocaleString('ko-KR')}원 (예상)
                </p>
              )}
            </div>
            <button
              onClick={() => setStage('summary')}
              disabled={totalBoxes === 0}
              className="shrink-0 px-8 py-4 rounded-2xl bg-blue-600 text-white font-black text-[15px] shadow-[0_4px_16px_rgba(59,130,246,0.3)] active:scale-[0.98] transition-all disabled:opacity-40"
            >
              요약하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ── 3단계: 요약 바텀시트 ─────────────────────────────────────────── */
  return (
    <main
      className="min-h-screen bg-[#F2F4F6]"
      style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
    >
      <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setStage('results')} />

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[32px] max-h-[85vh] flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.15)]">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="px-6 pt-4 pb-3 flex items-start justify-between shrink-0">
          <div>
            <p className="text-[12px] font-bold text-gray-400 mb-1">
              {[
                applied?.q,
                applied?.spec && `규격 ${applied.spec}kg`,
                applied?.misu && `${applied.misu}미`,
                applied?.from || applied?.to
                  ? `${applied?.from || '—'}~${applied?.to || '—'}`
                  : '기간 전체',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h2 className="text-[22px] font-black text-gray-900">견적 요약</h2>
          </div>
          <button onClick={() => setStage('results')} className="p-2 -mr-1 mt-1">
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* LOT 목록 */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {selectedLots.map((lot, i) => {
            const boxes  = selectedQty[lot.id] ?? 0;
            const amount = calcAmount(lot, boxes);
            return (
              <div
                key={lot.id}
                className={`py-4 ${i < selectedLots.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <p className="font-mono text-[11px] font-black text-blue-500 tracking-tight break-all mb-1">
                  {lot.lotNumber}
                </p>
                <div className="flex justify-between items-baseline gap-2">
                  <p className="text-[15px] font-black text-gray-900">
                    {boxes.toLocaleString('ko-KR')}박스
                  </p>
                  {amount > 0 ? (
                    <p className="text-[14px] font-bold text-gray-700 shrink-0">
                      {amount.toLocaleString('ko-KR')}원
                    </p>
                  ) : (
                    <p className="text-[13px] text-gray-400 shrink-0">단가 미산출</p>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {lot.productName}
                  {lot.spec ? ` · ${lot.spec}kg` : ''}
                  {lot.misu ? ` · ${lot.misu}미` : ''}
                </p>
              </div>
            );
          })}
        </div>

        {/* 합계 + 버튼 */}
        <div
          className="px-6 pt-4 pb-6 bg-gray-50 border-t border-gray-100 shrink-0 space-y-5"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-between items-center">
            <p className="text-[15px] font-bold text-gray-500">합계</p>
            <div className="text-right">
              <p className="text-[26px] font-black text-blue-600 leading-tight">
                {totalBoxes.toLocaleString('ko-KR')}박스
              </p>
              {totalAmount > 0 && (
                <p className="text-[14px] font-bold text-gray-500 mt-0.5">
                  {totalAmount.toLocaleString('ko-KR')}원 (예상)
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={openTransferSheet}
              className="py-4 rounded-2xl bg-orange-500 text-white font-black text-[14px] flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(249,115,22,0.3)] active:scale-[0.98] transition-all"
            >
              <ArrowsRightLeftIcon className="w-5 h-5" />
              재고 이동
            </button>
            <button
              onClick={openOutboundSheet}
              className="py-4 rounded-2xl bg-red-600 text-white font-black text-[14px] flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(239,68,68,0.3)] active:scale-[0.98] transition-all"
            >
              <ArrowUpOnSquareIcon className="w-5 h-5" />
              출고 요청
            </button>
          </div>
        </div>
      </div>

      {/* ── 묶음 출고 바텀시트 ──────────────────────────────────────────── */}
      <BulkSubmitSheet
        isOpen={outboundOpen}
        onClose={() => setOutboundOpen(false)}
        title="묶음 출고 신청"
        subtitle={`${selectedLots.length}건 LOT · 총 ${totalBoxes.toLocaleString('ko-KR')}박스`}
        accent="red"
        canSubmit={!!seller.trim() && !!salePrice.trim() && Number(salePrice) > 0 && !!outboundDate}
        submitting={submitting}
        submitLabel={`출고 신청 (${selectedLots.length}건)`}
        onSubmit={handleBulkOutbound}
      >
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-gray-500 ml-1">
            판매처 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            placeholder="예: ○○수산"
            className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-gray-500 ml-1">
            판매가 (원/kg) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="예: 12000"
            min={0}
            className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-gray-500 ml-1">
            출고일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={outboundDate}
            onChange={(e) => setOutboundDate(e.target.value)}
            className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>
        <p className="text-[12px] font-medium text-gray-400 pt-1">
          선택된 {selectedLots.length}건 LOT 모두 동일한 판매처·판매가로 출고됩니다.
        </p>
      </BulkSubmitSheet>

      {/* ── 묶음 이동 바텀시트 ──────────────────────────────────────────── */}
      <BulkSubmitSheet
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="묶음 재고 이동"
        subtitle={`${selectedLots.length}건 LOT · 총 ${totalBoxes.toLocaleString('ko-KR')}박스`}
        accent="orange"
        canSubmit={!!targetStorageId && !!transferDate}
        submitting={submitting}
        submitLabel={`이동 신청 (${selectedLots.length}건)`}
        onSubmit={handleBulkTransfer}
      >
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-gray-500 ml-1">
            이동 후 보관처 <span className="text-red-500">*</span>
          </label>
          <select
            value={targetStorageId}
            onChange={(e) => setTargetStorageId(e.target.value)}
            className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-orange-500 transition-all appearance-none"
          >
            <option value="">보관처를 선택하세요</option>
            {storageOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-gray-500 ml-1">
            이동일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-orange-500 transition-all"
          />
        </div>
        <p className="text-[12px] font-medium text-gray-400 pt-1">
          선택된 {selectedLots.length}건 LOT 모두 동일한 보관처로 이동됩니다.
        </p>
      </BulkSubmitSheet>
    </main>
  );
}
