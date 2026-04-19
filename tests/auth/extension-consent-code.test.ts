/**
 * EXT-0C — extension consent code HMAC + single-use helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXTENSION_CONSENT_CODE_TTL_MS,
  getExtensionConsentSecret,
  isExtensionConsentCodeConsumed,
  markExtensionConsentCodeConsumed,
  signExtensionConsentCode,
  verifyExtensionConsentCode
} from "../../src/auth/extension-consent-code.js";

describe("extension-consent-code", () => {
  const prev = process.env.RELAY_EXTENSION_CONSENT_SECRET;

  beforeEach(() => {
    process.env.RELAY_EXTENSION_CONSENT_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.RELAY_EXTENSION_CONSENT_SECRET = prev;
  });

  it("sign + verify round-trip", () => {
    const { consent_code } = signExtensionConsentCode({
      accountId: "acc_1",
      installationId: "inst_a"
    });
    const v = verifyExtensionConsentCode(consent_code);
    expect(v).toEqual({
      ok: true,
      accountId: "acc_1",
      installationId: "inst_a"
    });
  });

  it("verify rejects bad signature", () => {
    const { consent_code } = signExtensionConsentCode({
      accountId: "acc_1",
      installationId: "inst_a"
    });
    const parts = consent_code.split(".");
    parts[2] = "bad";
    const v = verifyExtensionConsentCode(parts.join("."));
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ ok: false, reason: "signature" });
  });

  it("verify returns expired after TTL", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const { consent_code } = signExtensionConsentCode({
      accountId: "acc_1",
      installationId: "inst_a"
    });
    vi.setSystemTime(t0 + EXTENSION_CONSENT_CODE_TTL_MS + 1);
    const v = verifyExtensionConsentCode(consent_code);
    expect(v).toMatchObject({ ok: false, reason: "expired" });
    vi.useRealTimers();
  });

  it("mark consumed blocks replay check", () => {
    const { consent_code } = signExtensionConsentCode({
      accountId: "acc_1",
      installationId: "inst_a"
    });
    expect(isExtensionConsentCodeConsumed(consent_code)).toBe(false);
    markExtensionConsentCodeConsumed(consent_code);
    expect(isExtensionConsentCodeConsumed(consent_code)).toBe(true);
  });

  it("getExtensionConsentSecret rejects short value", () => {
    process.env.RELAY_EXTENSION_CONSENT_SECRET = "tooshort";
    expect(getExtensionConsentSecret()).toBeNull();
  });
});
