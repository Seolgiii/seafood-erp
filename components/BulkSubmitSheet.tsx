'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  footer,
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
  /** 기본 submit 버튼 대신 표시할 footer (결과 화면 등에 사용) */
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

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

  // 포커스 관리: 열릴 때 첫 입력으로, 닫힐 때 직전 포커스 복원
  useEffect(() => {
    if (!mounted) return;

    previousFocusRef.current =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    const id = requestAnimationFrame(() => {
      const el = dialogRef.current;
      if (!el) return;
      const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const firstInput = el.querySelector<HTMLElement>('input, textarea');
      const target = firstInput ?? focusables[0];
      target?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(id);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [mounted]);

  // ESC 닫기 + 배경 스크롤 잠금 + Tab focus trap
  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submitting) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = dialogRef.current;
      if (!el) return;
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((n) => !n.hasAttribute('disabled'));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, onClose, submitting]);

  if (!mounted) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={() => { if (!submitting) onClose(); }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.10)] transition-transform duration-300 ease-out flex flex-col"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '90vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-200" />
        </div>

        <div className="flex items-start justify-between px-6 pt-2 pb-3 shrink-0">
          <div>
            <h2 id={titleId} className="text-[18px] font-black text-gray-900">{title}</h2>
            {subtitle && (
              <p id={subtitleId} className="text-[13px] font-medium text-gray-500 mt-0.5">{subtitle}</p>
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
          {footer ?? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || submitting}
              className={`w-full py-4 rounded-2xl text-white text-[16px] font-black transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${accentBg[accent]} ${accentShadow[accent]}`}
            >
              {submitting ? '신청 중...' : submitLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
