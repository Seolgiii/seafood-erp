'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetected: (code: string) => void;
}

const READER_ID = 'seaerp-barcode-reader';

/**
 * html5-qrcode 기반 QR코드 스캐너.
 * 마운트 시 후면 카메라를 열고, QR 감지 시 onDetected를 호출한 뒤 카메라를 닫는다.
 * 언마운트 시 자동으로 카메라 스트림을 정리한다.
 */
export default function BarcodeScanner({ onDetected }: Props) {
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  // ref로 최신 콜백을 보관 — 클로저 문제 방지
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const doneRef = useRef(false); // 중복 감지 방지

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any;

    const start = async () => {
      try {
        // html5-qrcode는 브라우저 전용 → 동적 import (ssr:false 보장 후에도 명시적으로 lazy)
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        scanner = new Html5Qrcode(READER_ID);
        const containerW = document.getElementById(READER_ID)?.parentElement?.clientWidth ?? 320;
        const boxSize = Math.min(Math.round(containerW * 0.80), 260);

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: boxSize, height: boxSize } },
          (text: string) => {
            if (doneRef.current || cancelled) return;
            doneRef.current = true;
            scanner
              .stop()
              .catch(() => {})
              .finally(() => {
                if (!cancelled) onDetectedRef.current(text.trim());
              });
          },
          () => {},
        );

        if (!cancelled) setStatus('scanning');
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = String(err instanceof Error ? err.message : err);
        setErrorMsg(
          /permission|NotAllowed|denied/i.test(msg)
            ? '카메라 권한을 허용해 주세요. (브라우저 주소창 옆 잠금 아이콘)'
            : '카메라를 시작할 수 없습니다. 다시 시도해 주세요.',
        );
        setStatus('error');
        console.error('[BarcodeScanner] 카메라 오류:', msg);
      }
    };

    // Promise를 변수에 담아 unhandled rejection을 방지합니다.
    const promise = start();
    promise.catch((err) => {
      if (!cancelled) console.error('[BarcodeScanner] 예상치 못한 오류:', err);
    });

    return () => {
      cancelled = true;
      doneRef.current = true;
      if (scanner) scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="space-y-2">
      {/* html5-qrcode가 이 div 안에 video 엘리먼트를 삽입한다 */}
      <div
        className="relative overflow-hidden rounded-2xl bg-black"
        style={{ minHeight: 220 }}
      >
        <div id={READER_ID} className="w-full" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <p className="text-white text-sm font-bold animate-pulse">카메라 시작 중...</p>
          </div>
        )}
      </div>

      {status === 'error' && (
        <div className="px-4 py-3 bg-red-50 rounded-2xl">
          <p className="text-sm font-bold text-red-600 text-center">{errorMsg}</p>
        </div>
      )}

      {status === 'scanning' && (
        <p className="text-center text-xs font-medium text-gray-400">
          QR코드를 카메라에 맞춰주세요
        </p>
      )}
    </div>
  );
}
