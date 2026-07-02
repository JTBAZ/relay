/** @vitest-environment happy-dom */

/**
 * Slice A — Extension status probe unit tests.
 * Tests probeRelayExtensionStatus(), sendConsentCodeToExtension() return value,
 * and the isExternalStatusRequest type guard.
 */
import { describe, expect, it } from "vitest";
import {
  probeRelayExtensionStatus,
  sendConsentCodeToExtension,
  type RelayExtensionStatusProbeResult
} from "../../web/lib/relay-extension-messaging";

// ---------------------------------------------------------------------------
// Helpers to inject a fake runtime into the module under test.
// We exercise getExtensionRuntime() via window.chrome.runtime; happy-dom
// provides a bare window object so we can patch it freely.
// ---------------------------------------------------------------------------

function withRuntime(sendMessage: (...args: unknown[]) => unknown, fn: () => Promise<void>) {
  const original = (window as Record<string, unknown>).chrome;
  (window as Record<string, unknown>).chrome = { runtime: { sendMessage } };
  return fn().finally(() => {
    (window as Record<string, unknown>).chrome = original;
  });
}

function patchEnv(ids: string) {
  const original = process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS;
  process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS = ids;
  return () => {
    process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS = original;
  };
}

// ---------------------------------------------------------------------------
// probeRelayExtensionStatus
// ---------------------------------------------------------------------------

describe("probeRelayExtensionStatus", () => {
  it("returns no_extension_ids when env is empty", async () => {
    const restore = patchEnv("");
    try {
      const result = await probeRelayExtensionStatus();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("no_extension_ids");
    } finally {
      restore();
    }
  });

  it("returns no_runtime when window.chrome is absent", async () => {
    const restore = patchEnv("ext-abc123");
    const original = (window as Record<string, unknown>).chrome;
    delete (window as Record<string, unknown>).chrome;
    try {
      const result = await probeRelayExtensionStatus();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("no_runtime");
    } finally {
      (window as Record<string, unknown>).chrome = original;
      restore();
    }
  });

  it("returns ok with fields when extension responds correctly", async () => {
    const restore = patchEnv("ext-abc123");
    const statusPayload = {
      ok: true,
      hasGrant: true,
      relayCreatorId: "rcx_test",
      patreonCookiePresent: true,
      lastSyncAt: "2026-06-22T12:00:00.000Z",
      lastSyncStatus: "stored"
    };
    try {
      let result!: RelayExtensionStatusProbeResult;
      await withRuntime(
        (_extId, _msg) => Promise.resolve(statusPayload),
        async () => {
          result = await probeRelayExtensionStatus();
        }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.extensionId).toBe("ext-abc123");
        expect(result.hasGrant).toBe(true);
        expect(result.relayCreatorId).toBe("rcx_test");
        expect(result.patreonCookiePresent).toBe(true);
        expect(result.lastSyncAt).toBe("2026-06-22T12:00:00.000Z");
        expect(result.lastSyncStatus).toBe("stored");
      }
    } finally {
      restore();
    }
  });

  it("returns ok with hasGrant=false when extension has no grant", async () => {
    const restore = patchEnv("ext-abc123");
    const statusPayload = {
      ok: true,
      hasGrant: false,
      relayCreatorId: null,
      patreonCookiePresent: false,
      lastSyncAt: null,
      lastSyncStatus: null
    };
    try {
      let result!: RelayExtensionStatusProbeResult;
      await withRuntime(
        () => Promise.resolve(statusPayload),
        async () => {
          result = await probeRelayExtensionStatus();
        }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hasGrant).toBe(false);
        expect(result.patreonCookiePresent).toBe(false);
      }
    } finally {
      restore();
    }
  });

  it("returns all_failed when extension throws", async () => {
    const restore = patchEnv("ext-abc123");
    try {
      let result!: RelayExtensionStatusProbeResult;
      await withRuntime(
        () => { throw new Error("Connection refused"); },
        async () => {
          result = await probeRelayExtensionStatus();
        }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("all_failed");
        expect(result.detail).toContain("Connection refused");
      }
    } finally {
      restore();
    }
  });

  it("returns all_failed when extension returns unrecognised shape", async () => {
    const restore = patchEnv("ext-abc123");
    try {
      let result!: RelayExtensionStatusProbeResult;
      await withRuntime(
        () => Promise.resolve({ ok: false, error: "Unknown message." }),
        async () => {
          result = await probeRelayExtensionStatus();
        }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("all_failed");
    } finally {
      restore();
    }
  });

  it("tries next ID when first throws and succeeds", async () => {
    const restore = patchEnv("ext-bad,ext-good");
    const goodPayload = {
      ok: true,
      hasGrant: true,
      relayCreatorId: "rcx_ok",
      patreonCookiePresent: false,
      lastSyncAt: null,
      lastSyncStatus: null
    };
    try {
      let result!: RelayExtensionStatusProbeResult;
      await withRuntime(
        (extId) => extId === "ext-bad"
          ? Promise.reject(new Error("not found"))
          : Promise.resolve(goodPayload),
        async () => {
          result = await probeRelayExtensionStatus();
        }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.extensionId).toBe("ext-good");
        expect(result.relayCreatorId).toBe("rcx_ok");
      }
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// sendConsentCodeToExtension — return value
// ---------------------------------------------------------------------------

describe("sendConsentCodeToExtension return value", () => {
  it("returns ok:true when extension responds { ok: true }", async () => {
    const restore = patchEnv("ext-abc123");
    try {
      let result!: { ok: boolean };
      await withRuntime(
        () => Promise.resolve({ ok: true }),
        async () => {
          result = await sendConsentCodeToExtension("ext-abc123", "code123");
        }
      );
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  it("returns ok:false with error when extension responds { ok: false, error }", async () => {
    const restore = patchEnv("ext-abc123");
    try {
      let result!: { ok: boolean; error?: string };
      await withRuntime(
        () => Promise.resolve({ ok: false, error: "Consent code expired." }),
        async () => {
          result = await sendConsentCodeToExtension("ext-abc123", "old-code");
        }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Consent code expired.");
    } finally {
      restore();
    }
  });

  it("treats missing response shape as ok:true for backward compat", async () => {
    const restore = patchEnv("ext-abc123");
    try {
      let result!: { ok: boolean };
      await withRuntime(
        () => Promise.resolve(undefined),
        async () => {
          result = await sendConsentCodeToExtension("ext-abc123", "code");
        }
      );
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  it("throws when no runtime is available", async () => {
    const restore = patchEnv("ext-abc123");
    const original = (window as Record<string, unknown>).chrome;
    delete (window as Record<string, unknown>).chrome;
    try {
      await expect(
        sendConsentCodeToExtension("ext-abc123", "code")
      ).rejects.toThrow(/extension/i);
    } finally {
      (window as Record<string, unknown>).chrome = original;
      restore();
    }
  });
});
