"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createInventoryRecord, getMasterGuide, getStorageOptions } from "@/app/actions";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { readSession } from "@/lib/session";

export default function InventoryRecordPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");

  const [formData, setFormData] = useState({
    itemName: "",
    spec: "",
    count: "",
    quantity: "",
    price: "",
    storage: "",
    origin: "국내산",
    remarks: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guideMessage, setGuideMessage] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  // 보관처 드롭다운 상태
  const [storageOptions, setStorageOptions] = useState<string[]>([]);
  const [storageQuery, setStorageQuery] = useState("");
  const [storageOpen, setStorageOpen] = useState(false);
  const storageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = readSession();
    if (s) {
      setWorkerId(s.workerId);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getStorageOptions().then(setStorageOptions);
  }, []);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (storageRef.current && !storageRef.current.contains(e.target as Node)) {
        setStorageOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredStorage = storageOptions.filter((opt) =>
    opt.includes(storageQuery)
  );

  const handleNumberChange = (field: string, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const commaValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setFormData({ ...formData, [field]: commaValue });
  };

  const handleBlurItemName = async () => {
    if (!formData.itemName.trim()) return;
    setGuideMessage("정보 확인 중...");
    try {
      const result = await getMasterGuide(formData.itemName);
      if (result.success && result.records && result.records.length > 0) {
        const masterData = result.records[0].fields;
        setGuideMessage(
          `추천 규격: ${masterData["권장표기"] || "없음"} / 기본 원산지: ${masterData["원산지"] || "국내산"}`
        );
        if (!formData.origin || formData.origin === "국내산") {
          setFormData((prev) => ({
            ...prev,
            origin: masterData["원산지"] || "국내산",
          }));
        }
      } else {
        setGuideMessage("신규 품목입니다. 정보를 직접 입력해주세요.");
      }
    } catch {
      setGuideMessage("마스터 정보를 불러올 수 없습니다.");
    }
  };

  const handleSubmit = async () => {
    if (!formData.itemName.trim()) return alert("품목명을 입력해주세요.");
    if (!formData.quantity.trim()) return alert("입고 수량을 입력해주세요.");

    setIsSubmitting(true);
    try {
      const payload = {
        입고일자: (now ?? new Date()).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "/").replace(/\./g, ""),
        품목명: formData.itemName,
        규격: formData.spec,
        미수: formData.count,
        "입고수량(BOX)": Number(formData.quantity.replace(/,/g, "")),
        수매가: Number(formData.price.replace(/,/g, "")),
        보관처: formData.storage,
        원산지: formData.origin,
        비고: formData.remarks,
        작업자: workerId,
      };
      const result = await createInventoryRecord(payload);
      if (result.success) {
        alert("입고 처리가 완료되었습니다.");
        router.push("/");
      } else {
        alert("입고 등록 실패: 서버 통신 오류");
      }
    } catch {
      alert("처리 중 에러가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10 font-['Spoqa_Han_Sans_Neo']">
      <header className="bg-white px-4 py-4 flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            className="p-2 -ml-2 active:scale-95 transition-transform"
          >
            <ChevronLeftIcon className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[18px] font-black tracking-tight text-[#3182F6]">
              물품 입고
            </h1>
            <span className="text-[13px] font-medium text-gray-500 whitespace-nowrap">
              어떤 물건이 들어왔나요?
            </span>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-gray-500 font-medium">
            {now ? now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : ""}
          </p>
          <p className="text-[14px] font-bold text-gray-900">
            {now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : ""}
          </p>
        </div>
      </header>

      <main className="p-5 flex flex-col gap-5">
        <div className="bg-white p-6 rounded-[28px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-5">

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-bold text-gray-500 ml-1">품목명 (필수)</label>
            <input
              type="text"
              value={formData.itemName}
              onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
              onBlur={handleBlurItemName}
              placeholder="예 : 점고등어"
              className="w-full bg-gray-100 text-gray-900 text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
            />
            {guideMessage && (
              <p className="text-[#3182F6] text-[13px] font-bold ml-1">💡 {guideMessage}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">규격</label>
              <input
                type="text"
                value={formData.spec}
                onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                placeholder="예 : 10"
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">미수</label>
              <input
                type="text"
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                placeholder="예 : 42/44미"
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-[#3182F6] ml-1">수량 (BOX)</label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.quantity}
                onChange={(e) => handleNumberChange("quantity", e.target.value)}
                placeholder="0"
                className="w-full bg-blue-50 text-[#3182F6] text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">수매가 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.price}
                onChange={(e) => handleNumberChange("price", e.target.value)}
                placeholder="0"
                className="w-full bg-gray-100 text-gray-900 text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          {/* 보관처 + 원산지 — 2열 그리드 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">보관처</label>
              <div ref={storageRef} className="relative">
                <input
                  type="text"
                  value={storageQuery}
                  onChange={(e) => {
                    setStorageQuery(e.target.value);
                    setFormData({ ...formData, storage: e.target.value });
                    setStorageOpen(true);
                  }}
                  onFocus={() => setStorageOpen(true)}
                  placeholder="보관처 입력"
                  className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                />
                {storageOpen && filteredStorage.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredStorage.map((opt) => (
                      <li
                        key={opt}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setStorageQuery(opt);
                          setFormData({ ...formData, storage: opt });
                          setStorageOpen(false);
                        }}
                        className="px-4 py-3 text-[15px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">원산지</label>
              <input
                type="text"
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-bold text-gray-500 ml-1">비고</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="특이사항을 입력하세요"
              className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all resize-none min-h-[100px]"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`w-full text-white text-[18px] font-black py-5 rounded-[24px] transition-all active:scale-95 shadow-lg shadow-blue-100 mt-2 ${
            isSubmitting ? "bg-blue-400 cursor-not-allowed" : "bg-[#3182F6]"
          }`}
        >
          {isSubmitting ? "전송 중..." : "입고 신청하기"}
        </button>
      </main>
    </div>
  );
}
