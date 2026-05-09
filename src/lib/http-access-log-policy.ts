/**
 * High-frequency HTTP paths (health, metrics) — default access-line volume reduction in production.
 * @see docs/pilot-build-plan.md P2-obs-007
 */

export type HttpAccessEmit = "info" | "trace" | "skip";

function parseSampleRate(raw: string | undefined): number | undefined {
  if (raw === undefined || String(raw).trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return undefined;
  return n;
}

export function resolveHttpAccessLogEmit(input: {
  pathOnly: string;
  nodeEnv: string | undefined;
  sampleRateEnv: string | undefined;
  random: () => number;
}): HttpAccessEmit {
  if (!isHighVolumeAccessLogPath(input.pathOnly)) return "info";
  if (input.nodeEnv !== "production") return "info";

  const rate = parseSampleRate(input.sampleRateEnv);
  if (rate !== undefined) {
    return input.random() < rate ? "info" : "skip";
  }
  return "trace";
}

export function isHighVolumeAccessLogPath(pathOnly: string): boolean {
  if (pathOnly.startsWith("/api/v1/health")) return true;
  if (pathOnly.startsWith("/api/v1/metrics")) return true;
  if (
    pathOnly === "/api/v1/patron/entitlements/health" ||
    pathOnly.startsWith("/api/v1/patron/entitlements/health/")
  ) {
    return true;
  }
  return false;
}
