import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELAY_API_BASE,
  resolveRelayApiBaseFromEnv
} from "../../web/lib/relay-api-env";

describe("resolveRelayApiBaseFromEnv", () => {
  it("defaults when undefined or blank", () => {
    expect(resolveRelayApiBaseFromEnv(undefined)).toBe(DEFAULT_RELAY_API_BASE);
    expect(resolveRelayApiBaseFromEnv("")).toBe(DEFAULT_RELAY_API_BASE);
    expect(resolveRelayApiBaseFromEnv("  ")).toBe(DEFAULT_RELAY_API_BASE);
  });

  it("trims and strips trailing slashes", () => {
    expect(resolveRelayApiBaseFromEnv("  http://localhost:8787/  ")).toBe("http://localhost:8787");
  });

  it("accepts https production-style origins", () => {
    expect(resolveRelayApiBaseFromEnv("https://api.example.com")).toBe("https://api.example.com");
  });

  it("rejects non-URLs", () => {
    expect(() => resolveRelayApiBaseFromEnv("not-a-url")).toThrow(/Invalid NEXT_PUBLIC_RELAY_API_URL/);
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => resolveRelayApiBaseFromEnv("ftp://example.com")).toThrow(/http:/);
  });
});
