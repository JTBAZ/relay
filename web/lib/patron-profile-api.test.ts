/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPatronProfileMe,
  patchPatronProfileMe,
  type PatronProfileMe,
} from "./patron-profile-api";
import { RELAY_API_BASE } from "./relay-api";

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-test" } };
}

const sampleProfile: PatronProfileMe = {
  tenant_membership_id: "tm1",
  handle: "dev_riley",
  handle_norm: "dev_riley",
  display_name: "Dev Riley",
  bio: "Quiet patron.",
  avatar_url: null,
  banner_url: null,
  is_public: false,
  onboarding_step: 0,
  notification_digest_enabled: true,
  notification_digest_cadence: "weekly",
  notification_digest_slot: "evening",
  notification_digest_timezone: null,
};

describe("fetchPatronProfileMe", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /api/v1/patron/me and unwraps the envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(envelope(sampleProfile)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const profile = await fetchPatronProfileMe();

    expect(profile.display_name).toBe("Dev Riley");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${RELAY_API_BASE}/api/v1/patron/me`,
      expect.objectContaining({ credentials: "include" })
    );
  });
});

describe("patchPatronProfileMe", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes display_name and bio with trimmed strings", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope({
            ...sampleProfile,
            display_name: "Riley",
            bio: "Updated bio",
          })
        ),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const updated = await patchPatronProfileMe({
      display_name: "  Riley  ",
      bio: " Updated bio ",
    });

    expect(updated.bio).toBe("Updated bio");
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      display_name: "Riley",
      bio: "Updated bio",
    });
  });

  it("PATCHes banner_url", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope({
            ...sampleProfile,
            banner_url: "https://cdn.example/banner.jpg",
          })
        ),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    await patchPatronProfileMe({ banner_url: " https://cdn.example/banner.jpg " });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      banner_url: "https://cdn.example/banner.jpg",
    });
  });

  it("sends null for cleared fields", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(envelope({ ...sampleProfile, bio: null })),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    await patchPatronProfileMe({ bio: "   " });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ bio: null });
  });
});
