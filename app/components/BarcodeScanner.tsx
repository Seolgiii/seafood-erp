'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetected: (code: string) => void;
}

/**
 * QR 스캐너 컴포넌트 (브라우저 네이티브 API 우선)
 *
 * 감지 전략:
 *   1. getUserMedia로 카메라 스트림 직접 획득 (<video> 렌더)
 *   2. BarcodeDetector API가 있으면 사용 (Chrome 83+, Android Chrome)
 *   3. 없으면 canvas 프레임 캡처 + html5-qrcode.scanFile 폴백 (iOS Safari, Firefox)
 *
 * iOS Safari 필수 조건: HTTPS + video[playsInline] + video[muted]
 */
export default function BarcodeScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    // 스트림·rAF 일괄 정리
    const stopAll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    // ── 후면 카메라 우선, 실패 시 아무 카메라 ──────────────────────────────────
    const openCamera = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // ideal = 없어도 실패 안 함
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // facingMode 제약 제거 후 재시도
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    };

    const run = async () => {
      // ── 1. 카메라 스트림 획득 ────────────────────────────────────────────────
      let stream: MediaStream;
      try {
        stream = await openCamera();
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = String(err instanceof Error ? err.message : err);
        setErrorMsg(
          /Permission|NotAllowed|denied/i.test(msg)
            ? '카메라 권한을 허용해 주세요.\n브라우저 주소창 옆 잠금 아이콘 → 카메라 허용'
            : '카메라를 시작할 수 없습니다.\n다시 시도해 주세요.',
        );
        setStatus('error');
        return;
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;

      // ── 2. <video>에 스트림 연결 ─────────────────────────────────────────────
      const video = videoRef.current;
      if (!video) { stopAll(); return; }

      video.srcObject = stream;
      // iOS Safari: playsInline 없으면 강제 전체화면, muted 없으면 autoplay 차단
      video.playsInline = true;
      video.muted = true;
      try { await video.play(); } catch { /* autoplay 차단 환경에서도 계속 진행 */ }

      if (cancelled) return;
      setStatus('scanning');

      // ── 3. QR 감지 루프 ─────────────────────────────────────────────────────
      const hasBarcodeDetector =
        typeof window !== 'undefined' && 'BarcodeDetector' in window;

      if (hasBarcodeDetector) {
        await runBarcodeDetector(video, cancelled, stopAll);
      } else {
        await runCanvasFallback(video, cancelled, stopAll);
      }
    };

    // ── BarcodeDetector 경로 (Chrome/Android) ──────────────────────────────────
    const runBarcodeDetector = async (
      video: HTMLVideoElement,
      _cancelled: boolean,
      stopAll: () => void,
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });

      const tick = async () => {
        if (cancelled || doneRef.current) return;

        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const codes: any[] = await detector.detect(video);
            if (codes.length > 0 && !doneRef.current && !cancelled) {
              doneRef.current = true;
              stopAll();
              onDetectedRef.current(String(codes[0].rawValue));
              return;
            }
          } catch {
            // QR 없는 프레임 — 정상
          }
        }

        if (!cancelled && !doneRef.current) {
          rafRef.current = requestAnimationFrame(() => { tick(); });
        }
      };

      tick();
    };

    // ── canvas 폴백 경로 (iOS Safari, Firefox) ────────────────────────────────
    const runCanvasFallback = async (
      video: HTMLVideoElement,
      _cancelled: boolean,
      stopAll: () => void,
    ) => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;

      // html5-qrcode.scanFile 은 DOM 요소 ID가 필요 — hidden 컨테이너 재사용
      const HIDDEN_ID = '__barcodescanner_hidden__';
      if (!document.getElementById(HIDDEN_ID)) {
        const el = document.createElement('div');
        el.id = HIDDEN_ID;
        el.setAttribute(
          'style',
          'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;',
        );
        document.body.appendChild(el);
      }
      // verbose:false → 콘솔 로그 억제
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h5 = new Html5Qrcode(HIDDEN_ID, { verbose: false } as any);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let busy = false;

      const tick = async () => {
        if (cancelled || doneRef.current) return;

        if (
          !busy &&
          ctx &&
          video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
          video.videoWidth > 0
        ) {
          busy = true;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          try {
            // canvas → Blob → File → html5-qrcode 디코드
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', 0.85),
            );
            if (blob && !doneRef.current && !cancelled) {
              const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
              const decoded = await h5.scanFile(file, /* showImage */ false);
              if (!doneRef.current && !cancelled) {
                doneRef.current = true;
                busy = false;
                stopAll();
                onDetectedRef.current(decoded);
                return; // rAF 재등록 없이 종료
              }
            }
          } catch {
            // QR 없는 프레임 — 계속 진행
          }
          busy = false;
        }

        if (!cancelled && !doneRef.current) {
          rafRef.current = requestAnimationFrame(() => { tick(); });
        }
      };

      tick();
    };

    run().catch((err) => {
      if (!cancelled) {
        console.error('[BarcodeScanner]', err);
        setErrorMsg('카메라를 시작할 수 없습니다. 다시 시도해 주세요.');
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      stopAll();
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-black aspect-square">
        {/*
          iOS Safari 필수 속성:
          - playsInline: 전체화면 강제 방지
          - muted: autoplay 정책 통과
          - autoPlay: 마운트 즉시 재생 (getUserMedia play() 호출과 함께 이중 보장)
        */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: 'block' }}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <p className="text-white text-sm font-bold animate-pulse">카메라 시작 중...</p>
          </div>
        )}
      </div>

      {status === 'error' && (
        <div className="px-4 py-3 bg-red-50 rounded-2xl">
          <p className="text-sm font-bold text-red-600 text-center whitespace-pre-line">
            {errorMsg}
          </p>
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
