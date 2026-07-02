import { describe, expect, it } from "vitest";
import type { Response } from "express";
import {
  applyBaselineSecurityHeaders,
  BASELINE_SECURITY_HEADERS
} from "../src/security/baseline-response-headers.js";

describe("baseline response headers (R-SEC-11 Tier B)", () => {
  it("sets nosniff, frame, and referrer headers", () => {
    const headers = new Map<string, string>();
    const res: Pick<Response, "setHeader"> = {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers.set(name, String(value));
        return res as Response;
      }
    };
    applyBaselineSecurityHeaders(res);

    for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      expect(headers.get(name)).toBe(value);
    }
  });
});
