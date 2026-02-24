import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.smoke.test.ts"],
    testTimeout: 10000,
  },
});
