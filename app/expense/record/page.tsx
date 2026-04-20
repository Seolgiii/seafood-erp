'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { createInventoryRecord, getMasterGuide } from '@/app/actions';
import {
  getSeoulTodaySlash,
  getSeoulTodayISO,
  tryParseInboundDateInput,
} from '@/lib/inbound-date-input';
import {
  fromGroupedIntegerInput,
  fromGroupedQtyInputAllowDecimal,
} from '@/lib/number-format';
import { readSession } from '@/lib/session';

const DATE_ALERT =
  '날짜 형식이 올바르지 않아 오늘 날짜로 설정했습니다.';

export default function InventoryRecordPage() {
  const router = useRouter();
  const [workerName, setWorkerName] = useState('');
  const [workerId, setWorkerId] = useState('');

  useEffect(() => {
    const s = readSession();
    if (s) {
      setWorkerName(s.workerName);
      setWorkerId(s.workerId);
    }
  }, []);

  const [bizDateInput, setBizDateInput] = useState(() => getSeoulTodaySlash());
  const [formData, setFormData] = useState({
    productName: '',
    spec: '',
    quantity: '',
    count: '',
    origin: '국내산',
    totalPrice: '',
    notes: '',
  });

  const [placeholder, setPlaceholder] = useState('예: 42/44미');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProductNameBlur = async () => {
    if (!formData.productName.trim()) return;

    const guide = await getMasterGuide(formData.productName.trim());
    if (guide.success) {
      setFormData((prev) => ({ ...prev, origin: guide.origin }));
      setPlaceholder(guide.placeholder);
    } else {
      if (formData.productName.includes('필렛')) {
        setPlaceholder('예: 쪽 당 사이즈 or 피스');
      } else {
        setPlaceholder('예: 42/44미');
      }
    }
  };

  const handleDateBlur = useCallback(() => {
    const trimmed = bizDateInput.trim();
    if (!trimmed) {
      setBizDateInput(getSeoulTodaySlash());
      return;
    }
    const p = tryParseInboundDateInput(trimmed);
    if (p) setBizDateInput(p.slash);
    else {
      window.alert(DATE_ALERT);
      setBizDateInput(getSeoulTodaySlash());
    }
  }, [bizDateInput]);

  const resolveBizDateIso = (): string | null => {
    const trimmed = bizDateInput.trim();
    if (!trimmed) return getSeoulTodayISO();
    const p = tryParseInboundDateInput(trimmed);
    return p ? p.iso : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dateIso = resolveBizDateIso();
    if (!dateIso) {
      window.alert('입고 일자를 YYYY/MM/DD 형식으로 입력해 주세요.');
      return;
    }

    const spec = fromGroupedQtyInputAllowDecimal(formData.spec).value;
    const quantity = fromGroupedIntegerInput(formData.quantity).value;
    const totalPrice = fromGroupedIntegerInput(formData.totalPrice).value;

    if (!Number.isFinite(spec) || spec <= 0) {
      window.alert('규격(kg)을 확인해 주세요.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      window.alert('수량(BOX)은 1 이상이어야 합니다.');
      return;
    }
    if (!Number.isFinite(totalPrice) || totalPrice < 0) {
      window.alert('수매가를 확인해 주세요.');
      return;
    }

    setIsSubmitting(true);
    const result = await createInventoryRecord({
      ...formData,
      date: dateIso,
      "작업자": workerId,
      spec,
      quantity,
      totalPrice,
    });
    if (result.success) {
      alert('입고 등록 완료!');
      router.push('/');
    } else {
      alert(`저장 실패: ${'message' in result ? result.message : ''}`);
    }
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white border-b px-4 py-4 flex items-center sticky top-0 z-10 shadow-sm">
        <button type="button" onClick={() => router.push('/')} className="p-2 -ml-2 active:scale-95">
          <ChevronLeftIcon className="w-6 h-6 text-gray-600" />
        </button>
        <div className="ml-2">
          <h1 className="text-xl font-black text-gray-800">원물 입고 등록</h1>
          <p className="text-[10px] text-blue-500 font-bold">담당자: {workerName || "..."}</p>
        </div>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
          <div className="grid grid-cols-1 gap-5">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">입고 일자</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="YYYY/MM/DD"
                value={bizDateInput}
                onChange={(e) => setBizDateInput(e.target.value)}
                onBlur={handleDateBlur}
                autoComplete="off"
                className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">품목명</label>
              <input
                type="text"
                placeholder="예: 냉동고등어"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                onBlur={handleProductNameBlur}
                className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">원산지</label>
              <input
                type="text"
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                placeholder="예: 국내산, 러시아, 노르웨이"
                className="w-full p-5 bg-blue-50 border-2 border-blue-100 rounded-2xl text-lg font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-[10px] text-gray-400 ml-2">기본값 &apos;국내산&apos;입니다. 필요 시 직접 수정하세요.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-800 ml-1">규격 (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="예: 11.5"
                  value={formData.spec}
                  onChange={(e) => {
                    const { display } = fromGroupedQtyInputAllowDecimal(e.target.value);
                    setFormData({ ...formData, spec: display });
                  }}
                  className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-800 ml-1">수량 (BOX)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 10"
                  value={formData.quantity}
                  onChange={(e) => {
                    const { display } = fromGroupedIntegerInput(e.target.value);
                    setFormData({ ...formData, quantity: display });
                  }}
                  className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold text-blue-600"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">수매가 (총액)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="예: 1,000,000"
                value={formData.totalPrice}
                onChange={(e) => {
                  const { display } = fromGroupedIntegerInput(e.target.value);
                  setFormData({ ...formData, totalPrice: display });
                }}
                className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold text-red-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">미수</label>
              <input
                type="text"
                placeholder={placeholder}
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800 ml-1">비고 (특이사항)</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="예: 박스 파손 주의, 냉동 상태 양호"
                className="w-full p-5 bg-gray-50 border-none rounded-2xl text-base resize-none"
              />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full py-6 rounded-3xl text-xl font-black text-white shadow-xl transition-all bg-blue-600 active:scale-95">
            {isSubmitting ? '저장 중...' : '입고 등록 완료'}
          </button>
        </form>
      </div>
    </main>
  );
}
