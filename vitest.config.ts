import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/shims/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests that need PostgreSQL are skipped unless TEST_DATABASE_URL is set.
    testTimeout: 20_000,
    env: {
      AUTH_SECRET: "test-only-auth-secret-that-is-at-least-32-characters-long",
    },
  },
});
