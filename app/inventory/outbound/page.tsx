'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  TrashIcon,
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
  const handleSubmitAll = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

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

      if (!result.success) {
        setIsSubmitting(false);
        toast(`출고 실패 (${item.lotNumber}): ${result.error}`);
        return;
      }
    }

    setIsSubmitting(false);
    toast('출고 신청이 완료되었습니다. 관리자 승인 후 재고가 차감됩니다.', 'success');
    router.push('/');
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
        {/* ── 검색 · 선택 카드 ──────────────────────────────────────────── */}
        <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">

          {/* LOT 검색 입력 */}
          {!selectedLot && (
            <form onSubmit={handleSearch} className="space-y-3">
              <label className="text-[13px] font-bold text-gray-500 ml-1">
                품목명 또는 LOT 번호
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
                  <label className="text-[13px] font-bold text-gray-500 ml-1">현재 남은 재고</label>
                  <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-blue-600">
                    {formatIntKo(Math.trunc(Number(selectedLot.fields['재고수량'] ?? 0)))}박스
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">출고할 수량</label>
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
      </div>

      {/* ── 출고 신청 버튼 (장바구니 1건 이상) ─────────────────────────────── */}
      {cart.length > 0 && (
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
      )}
    </main>
  );
}
