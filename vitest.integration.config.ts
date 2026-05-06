import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * 통합 테스트 전용 Vitest 설정
 *
 * - 단위 테스트(lib/**.test.ts)와 분리
 * - test/integration 디렉터리만 실행
 * - server-only 모듈은 노드 환경에서 빈 스텁으로 대체
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globals: false,
    setupFiles: ["test/integration/setup.ts"],
    // 통합 테스트는 외부 mock에 의존하므로 isolation 보장
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
