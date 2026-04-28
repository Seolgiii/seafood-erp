'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PhotoIcon, CheckIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { createExpenseRecord, getApplicantInfo } from '@/app/actions';
import { fromGroupedIntegerInput } from '@/lib/number-format';
import { readSession } from '@/lib/session';
import { toast } from '@/lib/toast';

export default function NewExpensePage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState('');

  const [formData, setFormData] = useState({
    date: '',
    title: '',
    description: '',
    amount: '',
    isCorpCard: false,
    remarks: '',
    applicant: '',
    dept: '',
    position: '',
    bank: '',
    account: '',
    receiptUrl: '',
    applicantRecordId: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date: today }));
  }, []);

  // 세션 로드 + 신청자 정보 자동 로드
  useEffect(() => {
    async function loadSessionAndUserInfo() {
      const s = readSession();
      if (!s) return;
      setWorkerId(s.workerId);
      setFormData(prev => ({
        ...prev,
        applicant: s.workerName,
        applicantRecordId: s.workerId,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = await getApplicantInfo(s.workerName);
      console.log("getApplicantInfo result", info);
      if (info) {
        setFormData(prev => ({
          ...prev,
          dept: info["소속"],
          position: info["직급"],
          bank: info["은행명"],
          account: info["계좌번호"],
        }));
      }
    }
    loadSessionAndUserInfo();
  }, []);

  // 이미지 업로드 핸들러 — 서버 액션(1MB 제한)이 아닌 API route 직접 호출
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      const res = await fetch('/api/upload-receipt', { method: 'POST', body: uploadData });
      const result = await res.json();
      if (result.url) {
        setFormData(prev => ({ ...prev, receiptUrl: result.url }));
      } else {
        const msg = result.error || '업로드 실패';
        console.error('[handleFileChange] 영수증 업로드 실패:', msg);
        setUploadError(msg);
      }
    } catch (err) {
      console.error('[handleFileChange] 영수증 업로드 오류:', err);
      setUploadError('네트워크 오류로 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');
    console.log("submit applicantRecordId", formData.applicantRecordId);

    const amount = fromGroupedIntegerInput(formData.amount).value;
    const result = await createExpenseRecord({
      ...formData,
      date: formData.date || new Date().toISOString().split('T')[0],
      amount,
    });

    if (result.success) {
      toast("지출 결의서가 제출되었습니다.", "success");
      router.push('/');
    } else {
      setSubmitError(result.error || '제출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-[#F2F4F6] pb-10 font-['Spoqa_Han_Sans_Neo']">
      <PageHeader
        title="지출 결의서 작성"
        onBack={() => router.push('/')}
      />

      <div className="p-4 space-y-4">
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[2rem] shadow-sm space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-600">지출일</label>
              <div className="relative mt-1">
                <div className="w-full p-4 bg-gray-50 rounded-2xl font-bold">
                  {formData.date.replace(/-/g, '/')}
                </div>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e)=>setFormData({...formData, date:e.target.value})}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="지출일"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-gray-600">건명 (제목)</label>
              <input type="text" placeholder="예 : 점심 식대" value={formData.title} onChange={(e)=>setFormData({...formData, title:e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl mt-1 font-bold" required />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-600">적요 (내용)</label>
              <input type="text" placeholder="예 : 사용처 혹은 목적" value={formData.description} onChange={(e)=>setFormData({...formData, description:e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl mt-1 font-bold" required />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-gray-600">결제 금액</label>
                <label className="flex cursor-pointer items-center gap-1.5 active:scale-95 transition-all">
                  <input
                    type="checkbox"
                    checked={formData.isCorpCard}
                    onChange={(e) => setFormData({ ...formData, isCorpCard: e.target.checked })}
                    className="hidden"
                  />
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      formData.isCorpCard ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                    }`}
                  >
                    {formData.isCorpCard && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <span className="text-[13px] font-bold text-gray-700 whitespace-nowrap">법인카드</span>
                </label>
              </div>
              <input
                type="text"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: fromGroupedIntegerInput(e.target.value).display })}
                className="mt-1 w-full p-4 bg-gray-50 rounded-2xl font-black text-blue-600"
                required
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-600">비고</label>
              <input type="text" value={formData.remarks} onChange={(e)=>setFormData({...formData, remarks:e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl mt-1 font-bold" />
            </div>

            {/* 영수증 업로드 */}
            <div>
              <label className="text-sm font-bold text-gray-600">영수증 첨부</label>
              <label className="mt-2 flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all">
                {isUploading ? <p className="animate-pulse">업로드 중...</p> :
                 formData.receiptUrl ? <p className="text-blue-600 font-bold">✅ 업로드 완료</p> :
                 <>
                  <PhotoIcon className="w-8 h-8 text-gray-400" />
                  <p className="text-xs text-gray-500 mt-2">터치하여 사진 촬영 또는 업로드</p>
                 </>
                }
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
              {uploadError && (
                <p className="mt-1 text-xs font-bold text-red-600">{uploadError}</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting || isUploading} className={`w-full py-6 rounded-2xl text-xl font-black text-white shadow-lg ${isSubmitting ? 'bg-gray-400' : 'bg-blue-600'} active:scale-95 transition-all`}>
            {isSubmitting ? '제출 중...' : '지출 신청하기'}
          </button>
          {submitError && (
            <p className="text-sm font-bold text-red-600 text-center">{submitError}</p>
          )}
        </form>
      </div>
    </main>
  );
}