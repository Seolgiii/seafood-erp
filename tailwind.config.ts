import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 추가된 토스 스타일 애니메이션 키프레임
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      // 추가된 애니메이션 실행 설정
      animation: {
        "slide-up": "slide-up 0.3s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-in-out forwards",
      },
    },
  },
  plugins: [],
};

// 파일 전체를 통틀어 export default는 이 위치에 딱 한 번만 있어야 합니다!
export default config;