import type { Viewport } from "next";
import { WorkerPinLogin } from "@/components/WorkerPinLogin";

/**
 * 로그인 페이지 전용 viewport — 상단 헤더의 #3182F6 파란색이
 * iOS Safari status bar(시계·배터리 영역)까지 자연스럽게 이어지도록 합니다.
 * 다른 페이지는 root layout의 themeColor(#F2F4F6)를 그대로 사용합니다.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3182F6",
};

export default function LoginPage() {
  return <WorkerPinLogin />;
}
