import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["engine.tests/**/*.test.ts", "ops/**/*.test.ts", "tools/**/*.test.ts", "game/**/*.test.ts"],
    environment: "node",
  },
});
