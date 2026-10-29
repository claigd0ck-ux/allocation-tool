import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Design Ref: §8 — 계산 코드를 정답(examples/oracle.mjs)과 자동 비교하는 테스트 설정
export default defineConfig({
  resolve: {
    // tsconfig의 "@/*" → 프로젝트 루트 별칭과 같게 맞춘다
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
