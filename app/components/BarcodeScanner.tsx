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
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        scanner = new Html5Qrcode(READER_ID);
        const containerW = document.getElementById(READER_ID)?.parentElement?.clientWidth ?? 320;
        const boxSize = Math.min(Math.round(containerW * 0.80), 260);
        const scanConfig = { fps: 12, qrbox: { width: boxSize, height: boxSize } };

        const onSuccess = (text: string) => {
          if (doneRef.current || cancelled) return;
          doneRef.current = true;
          scanner.stop().catch(() => {}).finally(() => {
            if (!cancelled) onDetectedRef.current(text.trim());
          });
        };

        // { facingMode: 'environment' } 는 iOS Safari에서 strict 제약으로 실패할 수 있습니다.
        // ideal을 사용해 후면 카메라를 선호하되 없어도 동작하도록 합니다.
        try {
          await scanner.start(
            { facingMode: { ideal: 'environment' } },
            scanConfig,
            onSuccess,
            () => {},
          );
        } catch {
          // 첫 번째 시도 실패 시 카메라 목록에서 후면 카메라를 직접 선택합니다.
          if (cancelled) return;
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) throw new Error('카메라를 찾을 수 없습니다.');
          // 레이블에 'back' 또는 'rear' 가 있으면 후면, 없으면 마지막 카메라
          const back = cameras.find((c) => /back|rear|environment/i.test(c.label))
            ?? cameras[cameras.length - 1];
          await scanner.start(back.id, scanConfig, onSuccess, () => {});
        }

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
