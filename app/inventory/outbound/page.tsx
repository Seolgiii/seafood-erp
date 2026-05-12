'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { searchLotByKeyword, createOutboundRecord } from '@/app/actions';
import { formatIntKo, fromGroupedIntegerInput } from '@/lib/number-format';
import { readSession } from '@/lib/session';
import { toast } from '@/lib/toast';

type CartItem = {
  cartId: string;
  lotId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  misu: string;
  origin: string;
  storage: string;
  quantity: number;
  seller: string;
  salePrice: number | undefined;
};

// LOT 검색 결과 — Airtable 응답을 구조화하지 않고 그대로 사용
// (필드 키가 베이스 마이그레이션에 따라 가변적이라 인덱스 시그니처로 표현)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LotSearchResult = { id: string; fields: Record<string, any> };

function formatMisuDisplay(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  if (s.endsWith('미')) return s;
  return `${s} 미`;
}

export default function OutboundRecordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workerId, setWorkerId] = useState('');

  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<LotSearchResult[]>([]);
  const [selectedLot, setSelectedLot] = useState<LotSearchResult | null>(null);

  const [quantity, setQuantity] = useState('');
  const [seller, setSeller] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  // ── 묶음 처리 결과 (B안: 부분 성공·실패 표시) ─────────────────────────────
  // status 페이지의 handleBulkOutbound 패턴과 동일한 형태로 정렬.
  // cart는 동일 LOT을 다른 판매처/판매가로 여러 번 담을 수 있으므로
  // 식별자는 lotId가 아닌 cartId(고유) 기준.
  type BulkResult = {
    successCartIds: string[];
    failures: { cartId: string; lotNumber: string; reason: string }[];
  };
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // ── 초기화 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  // ── 검색 공통 로직 ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true);
    setSelectedLot(null);
    const result = await searchLotByKeyword(q);
    if (result.success) {
      if (result.records.length === 0) toast('일치하는 재고가 없습니다.', 'info');
      setSearchResults(result.records);
      if (result.records.length === 1) setSelectedLot(result.records[0]);
    } else {
      toast(`검색 실패: ${result.error}`);
    }
    setIsSearching(false);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) { toast('검색어를 입력해주세요.'); return; }
    await doSearch(keyword);
  };

  // ── URL ?lot= 파라미터 자동 redirect ─────────────────────────────────────
  // 옛 입고증/출고증 PDF QR(`/inventory/outbound?lot=...`) 호환:
  // 새 QR 라우팅(`/inventory/lot/{번호}`)으로 자동 이동.
  useEffect(() => {
    const lot = searchParams.get('lot');
    if (!lot) return;
    router.replace(`/inventory/lot/${encodeURIComponent(lot)}`);
  }, [router, searchParams]);

  const resetForm = () => {
    setSelectedLot(null);
    setQuantity('');
    setSeller('');
    setSalePrice('');
    setKeyword('');
    setSearchResults([]);
  };

  // ── 장바구니 추가 ─────────────────────────────────────────────────────────
  const handleAddToCart = () => {
    if (!selectedLot) return;
    const qty = fromGroupedIntegerInput(quantity).value;
    if (!Number.isFinite(qty) || qty <= 0) { toast('출고 수량을 입력해 주세요.'); return; }
    const currentStock = Number(selectedLot.fields['재고수량'] ?? 0);
    if (qty > currentStock) { toast('현재 재고보다 많습니다!'); return; }

    setCart((prev) => [
      ...prev,
      {
        cartId: `${selectedLot.id}-${Date.now()}`,
        lotId: selectedLot.id,
        lotNumber: selectedLot.fields['LOT번호'],
        productName: selectedLot.fields['품목명'],
        spec: selectedLot.fields['규격'],
        misu: selectedLot.fields['미수'] ?? selectedLot.fields['상세규격_표기'] ?? '',
        origin: selectedLot.fields['원산지'],
        storage: String(selectedLot.fields['보관처'] ?? ''),
        quantity: qty,
        seller: seller.trim(),
        salePrice: salePrice ? fromGroupedIntegerInput(salePrice).value : undefined,
      },
    ]);

    // 검색결과·키워드 유지, 입력값만 초기화 → 같은 리스트에서 다음 LOT 선택
    setSelectedLot(null);
    setQuantity('');
    setSeller('');
    setSalePrice('');
  };

  // ── 출고 신청 ─────────────────────────────────────────────────────────────
  // B안 정책 (obsidian-vault/40_결정기록/출고이동_카트_UX_통일.md):
  //   첫 실패에서 abort 하지 않고 cart 끝까지 순회 → 성공/실패 분리 누적 →
  //   실패 1건 이상이면 결과 패널 표시. 모두 성공이면 기존 단일 toast + redirect.
  // 회귀 방지 안전망: test/integration/outbound-bulk-policy.test.ts 4 시나리오.
  const handleSubmitAll = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    const successCartIds: string[] = [];
    const failures: { cartId: string; lotNumber: string; reason: string }[] = [];

    for (const item of cart) {
      const result = await createOutboundRecord({
        date: new Date().toISOString().split('T')[0],
        lotNumber: item.lotNumber,
        lotRecordId: item.lotId,
        quantity: item.quantity,
        workerRecordId: workerId,
        spec: item.spec,
        origin: item.origin,
        misu: item.misu,
        seller: item.seller || undefined,
        salePrice: item.salePrice,
      });

      if (result.success) {
        successCartIds.push(item.cartId);
      } else {
        failures.push({
          cartId: item.cartId,
          lotNumber: item.lotNumber,
          reason: result.error ?? '알 수 없는 오류',
        });
      }
    }

    setIsSubmitting(false);

    if (failures.length === 0) {
      toast('출고 신청이 완료되었습니다. 관리자 승인 후 재고가 차감됩니다.', 'success');
      router.push('/');
      return;
    }

    setBulkResult({ successCartIds, failures });
  };

  // 실패 N건만 cart에 남기고 결과 패널 닫기 (재시도용)
  const retryFailedBulk = () => {
    if (!bulkResult) return;
    const succeeded = new Set(bulkResult.successCartIds);
    setCart((prev) => prev.filter((c) => !succeeded.has(c.cartId)));
    setBulkResult(null);
  };

  // 성공 LOT 제거 + 요약 toast 후 결과 패널 닫기
  const closeBulkResult = () => {
    if (!bulkResult) return;
    const succeeded = new Set(bulkResult.successCartIds);
    setCart((prev) => prev.filter((c) => !succeeded.has(c.cartId)));
    const successCount = bulkResult.successCartIds.length;
    const failCount = bulkResult.failures.length;
    const summary =
      successCount > 0
        ? `${successCount}건 신청 완료, ${failCount}건 실패`
        : `${failCount}건 모두 실패`;
    toast(summary, successCount > 0 ? 'info' : 'error');
    setBulkResult(null);
  };

  return (
    <main className="min-h-screen bg-[#F2F4F6] pb-32 font-['Spoqa_Han_Sans_Neo']">
      {/* 헤더 */}
      <PageHeader
        title="물품 출고"
        subtitle="어떤 물건이 출고되나요?"
        onBack={() => router.push('/')}
        titleClassName="text-[#FF3B30] font-black"
      />

      <div className="p-4 space-y-4">
        {!bulkResult && (
          <>
        {/* ── 검색 · 선택 카드 ──────────────────────────────────────────── */}
        <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">

          {/* LOT 검색 입력 */}
          {!selectedLot && (
            <form onSubmit={handleSearch} className="space-y-3">
              <label className="text-[13px] font-bold text-gray-500 ml-1">
                품목명 또는 LOT번호
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="예: 고등어, 0001"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1 min-w-0 bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="shrink-0 bg-[#FF3B30] text-white px-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSearching
                    ? <span className="text-[13px] font-bold px-1">...</span>
                    : <MagnifyingGlassIcon className="w-5 h-5" />
                  }
                </button>
              </div>
            </form>
          )}

          {/* ── 검색 결과 리스트 ─────────────────────────────────────────── */}
          {!selectedLot && searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-gray-400 ml-1">
                출고할 상품을 선택하세요 ({searchResults.length}건)
              </p>
              {searchResults.map((lot) => (
                <button
                  key={lot.id}
                  onClick={() => setSelectedLot(lot)}
                  className="w-full text-left p-4 rounded-2xl border border-red-100 bg-red-50 active:scale-95 transition-all"
                >
                  <p className="font-mono text-[12px] font-black text-[#FF3B30] tracking-tight mb-1">
                    {lot.fields['LOT번호']}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-black text-gray-800">
                      {lot.fields['품목명']}{' '}
                      <span className="text-[13px] text-gray-500 font-normal">
                        (규격 {lot.fields['규격']}kg /{' '}
                        {formatMisuDisplay(lot.fields['미수'] ?? lot.fields['상세규격_표기'])})
                      </span>
                    </p>
                    <p className="text-[13px] font-bold text-blue-600 shrink-0">
                      {formatIntKo(Math.trunc(Number(lot.fields['재고수량'] ?? 0)))}박스
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── LOT 선택 후: 수량 · 판매처 · 금액 입력 ──────────────────── */}
          {selectedLot && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-1 bg-red-100 text-[#FF3B30] text-[11px] font-black rounded-md mb-2">
                    선택된 상품
                  </span>
                  <p className="text-[15px] font-black text-gray-800">
                    {selectedLot.fields['품목명']}{' '}
                    <span className="text-[13px] text-gray-500 font-normal">
                      (규격 {selectedLot.fields['규격']}kg /{' '}
                      {formatMisuDisplay(
                        selectedLot.fields['미수'] ?? selectedLot.fields['상세규격_표기'],
                      )}
                      )
                    </span>
                  </p>
                  <p className="font-mono text-[12px] font-black text-[#FF3B30] tracking-tight mt-0.5">
                    {selectedLot.fields['LOT번호']}
                  </p>
                </div>
                <button onClick={resetForm} className="text-[12px] text-gray-400 underline p-2 shrink-0">
                  다시 검색
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">현재 재고</label>
                  <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-blue-600">
                    {formatIntKo(Math.trunc(Number(selectedLot.fields['재고수량'] ?? 0)))}박스
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">출고 수량</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="예: 100"
                    value={quantity}
                    autoFocus
                    onChange={(e) => {
                      const { display } = fromGroupedIntegerInput(e.target.value);
                      setQuantity(display);
                    }}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-[#FF3B30] outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-500 ml-1">보관처</label>
                <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-700">
                  {String(selectedLot.fields['보관처'] ?? '').trim() || '—'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">판매처</label>
                  <input
                    type="text"
                    placeholder="직접입력"
                    value={seller}
                    onChange={(e) => setSeller(e.target.value)}
                    maxLength={30}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">판매 금액</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="예: 50,000"
                    value={salePrice}
                    onChange={(e) => {
                      const { display } = fromGroupedIntegerInput(e.target.value);
                      setSalePrice(display);
                    }}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full py-4 rounded-2xl bg-gray-800 text-white text-[16px] font-black active:scale-95 transition-all"
              >
                + 출고 목록에 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 장바구니 리스트 ──────────────────────────────────────────────── */}
        {cart.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-400 ml-1">
              출고 목록 ({cart.length}건)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {cart.map((item) => (
                <div
                  key={item.cartId}
                  className="flex min-h-0 min-w-0 items-stretch gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-gray-400">{item.lotNumber}</p>
                    <p className="truncate text-[14px] font-black text-gray-800">
                      {item.productName}{' '}
                      <span className="text-[12px] font-normal text-gray-500">
                        ({item.spec}kg / {formatMisuDisplay(item.misu)})
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="text-[13px] font-bold text-[#FF3B30]">
                        {formatIntKo(item.quantity)}박스
                      </span>
                      {item.seller && (
                        <span className="text-[12px] text-gray-500">{item.seller}</span>
                      )}
                      {item.salePrice != null && (
                        <span className="text-[12px] text-gray-500">
                          {formatIntKo(item.salePrice)}원
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => prev.filter((c) => c.cartId !== item.cartId))
                      }
                      className="p-2 text-gray-300 hover:text-red-500 active:scale-90 transition-all"
                      aria-label="목록에서 삭제"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}

        {/* ── 결과 패널 (B안: 부분 성공/실패 표시) ─────────────────────── */}
        {bulkResult && (
          <div className="space-y-4">
            {bulkResult.successCartIds.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-[2rem] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  <p className="text-[14px] font-black text-green-700">
                    {bulkResult.successCartIds.length}건 신청 완료
                  </p>
                </div>
                <ul className="text-[12px] font-medium text-green-700 space-y-1 pl-7">
                  {bulkResult.successCartIds.map((cid) => {
                    const item = cart.find((c) => c.cartId === cid);
                    return (
                      <li key={cid} className="truncate font-mono">
                        {item?.lotNumber ?? '—'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {bulkResult.failures.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-[2rem] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ExclamationCircleIcon className="w-5 h-5 text-[#FF3B30]" />
                  <p className="text-[14px] font-black text-[#FF3B30]">
                    {bulkResult.failures.length}건 실패
                  </p>
                </div>
                <ul className="space-y-2 pl-7">
                  {bulkResult.failures.map((f) => (
                    <li key={f.cartId} className="text-[12px]">
                      <p className="font-bold text-gray-800 truncate font-mono">{f.lotNumber}</p>
                      <p className="text-gray-500 mt-0.5">{f.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[12px] font-medium text-gray-400 leading-relaxed px-1">
              성공한 건은 결재 대기로 등록되었습니다. 실패한 건만 다시 시도하거나 닫고 종료할 수 있습니다.
            </p>
          </div>
        )}
      </div>

      {/* ── 하단 고정 — 결과 패널일 땐 재시도/닫기, 평소엔 출고 신청 ──────── */}
      {bulkResult ? (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F4F6] border-t border-gray-200 space-y-2">
          {bulkResult.failures.length > 0 && (
            <button
              type="button"
              onClick={retryFailedBulk}
              className="w-full py-4 rounded-2xl text-white text-[16px] font-black bg-[#FF3B30] shadow-lg active:scale-[0.98] transition-all"
            >
              실패한 {bulkResult.failures.length}건 다시 시도
            </button>
          )}
          <button
            type="button"
            onClick={closeBulkResult}
            className="w-full py-3 rounded-2xl text-gray-700 text-[14px] font-bold bg-gray-100 active:scale-[0.98] transition-all"
          >
            닫기
          </button>
        </div>
      ) : cart.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F4F6] border-t border-gray-200">
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitting}
            className={`w-full py-5 rounded-2xl text-[18px] font-black text-white shadow-lg transition-all ${
              isSubmitting ? 'bg-red-300 cursor-not-allowed' : 'bg-[#FF3B30] active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? '신청 중...' : `출고 신청 (${cart.length}건)`}
          </button>
        </div>
      ) : null}
    </main>
  );
}
