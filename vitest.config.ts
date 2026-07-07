import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server/shared tests run in plain Node; component/hook tests that need
    // a DOM opt in per-file with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["./client/src/test-setup.ts"],
    include: [
      "client/src/**/*.{test,spec}.{ts,tsx}",
      "server/src/**/*.{test,spec}.ts",
      "shared/src/**/*.{test,spec}.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
