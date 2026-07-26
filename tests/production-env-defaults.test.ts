import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportRequireTierAccessFromEnv,
  platformOperatorAccessEnforceFromEnv,
  parseOptionalEnvBool
} from "../src/security/production-env-defaults.js";

describe("production env security defaults (Tier B)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("parseOptionalEnvBool", () => {
    it("returns undefined for unset or blank values", () => {
      expect(parseOptionalEnvBool(undefined)).toBeUndefined();
      expect(parseOptionalEnvBool("")).toBeUndefined();
      expect(parseOptionalEnvBool("   ")).toBeUndefined();
    });

    it("parses truthy and falsy strings", () => {
      expect(parseOptionalEnvBool("1")).toBe(true);
      expect(parseOptionalEnvBool("true")).toBe(true);
      expect(parseOptionalEnvBool("0")).toBe(false);
      expect(parseOptionalEnvBool("false")).toBe(false);
    });
  });

  describe("exportRequireTierAccessFromEnv", () => {
    it("defaults off in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(exportRequireTierAccessFromEnv()).toBe(false);
    });

    it("defaults on in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(exportRequireTierAccessFromEnv()).toBe(true);
    });

    it("honors explicit overrides in either environment", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RELAY_EXPORT_REQUIRE_TIER_ACCESS", "0");
      expect(exportRequireTierAccessFromEnv()).toBe(false);

      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RELAY_EXPORT_REQUIRE_TIER_ACCESS", "1");
      expect(exportRequireTierAccessFromEnv()).toBe(true);
    });
  });

  describe("platformOperatorAccessEnforceFromEnv", () => {
    it("defaults off in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(platformOperatorAccessEnforceFromEnv()).toBe(false);
    });

    it("defaults on in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(platformOperatorAccessEnforceFromEnv()).toBe(true);
    });

    it("honors explicit overrides in either environment", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE", "0");
      expect(platformOperatorAccessEnforceFromEnv()).toBe(false);

      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE", "1");
      expect(platformOperatorAccessEnforceFromEnv()).toBe(true);
    });
  });
});
