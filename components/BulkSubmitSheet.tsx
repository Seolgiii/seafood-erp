'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

type Accent = 'red' | 'orange';

const accentBg: Record<Accent, string> = {
  red: 'bg-[#FF3B30]',
  orange: 'bg-[#FF8C00]',
};
const accentShadow: Record<Accent, string> = {
  red: 'shadow-[0_4px_16px_rgba(255,59,48,0.3)]',
  orange: 'shadow-[0_4px_16px_rgba(255,140,0,0.3)]',
};

export function BulkSubmitSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  accent,
  canSubmit,
  submitting,
  submitLabel,
  onSubmit,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent: Accent;
  canSubmit: boolean;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen, mounted]);

  if (!mounted) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={() => { if (!submitting) onClose(); }}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.10)] transition-transform duration-300 ease-out flex flex-col"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '90vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-200" />
        </div>

        <div className="flex items-start justify-between px-6 pt-2 pb-3 shrink-0">
          <div>
            <h2 className="text-[18px] font-black text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-[13px] font-medium text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 -mr-1 active:scale-90 transition-transform disabled:opacity-30"
            aria-label="닫기"
          >
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-2 space-y-4 overflow-y-auto flex-1">
          {children}
        </div>

        <div
          className="px-6 pt-3 shrink-0"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full py-4 rounded-2xl text-white text-[16px] font-black transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${accentBg[accent]} ${accentShadow[accent]}`}
          >
            {submitting ? '신청 중...' : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
