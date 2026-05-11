/**
 * 앱 외부에 노출되는 절대 URL의 호스트를 반환한다.
 *
 * 용도: PDF QR 코드, 이메일 본문 링크 등 외부에서 다시 진입할 수 있는 URL의 prefix.
 * 우선순위:
 *   1. `NEXT_PUBLIC_BASE_URL` 환경변수
 *   2. 하드코딩된 production 호스트 (배포 기본값)
 */
export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    "https://seafood-erp.vercel.app"
  );
}
