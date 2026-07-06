import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "client/src/**/*.{test,spec}.{ts,tsx}",
      "server/src/**/*.{test,spec}.ts",
      "shared/src/**/*.{test,spec}.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
