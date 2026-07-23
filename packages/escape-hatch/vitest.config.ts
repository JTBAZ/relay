import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Clean-dir Next build (~60s+) can starve threads-pool RPC heartbeats
    // ("Timeout calling onTaskUpdate") even when all tests pass.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    teardownTimeout: 60_000,
    pool: "forks"
  }
});
