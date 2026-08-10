import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      obsidian: resolve(import.meta.dirname, "src/test/mocks/obsidian.ts"),
    },
  },
});
