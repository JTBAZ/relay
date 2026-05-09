import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workerJs = path.join(process.cwd(), "dist", "src", "worker.js");

describe("worker entry smoke", () => {
  const distReady = existsSync(workerJs);

  it.skipIf(!distReady)(
    "completes --smoke without starting the HTTP API",
    () => {
      const r = spawnSync(process.execPath, [workerJs, "--smoke"], {
        encoding: "utf8",
        env: {
          ...process.env,
          RELAY_JOB_BACKEND: "memory",
          // Worker subprocess inherits NODE_ENV=test from Vitest; logger defaults to silent — allow banner assertion.
          LOG_LEVEL: "info"
        },
        timeout: 60_000
      });
      const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status !== 0) {
        throw new Error(
          `worker --smoke exited ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`
        );
      }
      expect(combined).not.toMatch(/Relay API listening/);
      expect(combined).toMatch(/Relay worker process running \(no HTTP\)/);
    },
    60_000
  );
});
