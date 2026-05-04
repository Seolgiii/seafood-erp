import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only는 RSC 환경에서만 의미 있는 마커. 노드 테스트에선 빈 모듈로 대체.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
