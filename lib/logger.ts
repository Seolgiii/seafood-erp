// ─────────────────────────────────────────────────────────────────────────────
// 로깅 유틸
// 정책 (B안):
//   - log / logWarn : 개발 환경에서만 출력 (운영 노이즈·민감정보 노출 방지)
//   - logError      : 모든 환경에서 출력 (운영 장애 추적 필수)
// ─────────────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const log = (...args: any[]) => { if (isDev) console.log(...args); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logWarn = (...args: any[]) => { if (isDev) console.warn(...args); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logError = (...args: any[]) => { console.error(...args); };
