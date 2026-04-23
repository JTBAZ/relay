/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorPublicSlug = vi.fn();
const patchCreatorPublicSlug = vi.fn();
const getCreatorProfile = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    fetchCreatorPublicSlug: (...args: unknown[]) => fetchCreatorPublicSlug(...args),
    patchCreatorPublicSlug: (...args: unknown[]) => patchCreatorPublicSlug(...args),
    getCreatorProfile: (...args: unknown[]) => getCreatorProfile(...args),
    RelayApiError: StubRelayApiError,
    RELAY_CREATOR_ID_STORAGE_KEY: "relay_creator_id",
    RELAY_PUBLIC_SLUG_STORAGE_KEY: "relay_public_slug",
    buildPatreonCreatorAuthorizeUrl: vi.fn(),
    fetchPatronSessionIfPresent: vi.fn(),
    hasRelaySignedInCookie: vi.fn(),
    postCreatorWorkspace: vi.fn(),
    postPatreonCreatorPrepare: vi.fn(),
    patchCreatorProfile: vi.fn(),
  };
});

vi.mock("@/app/components/studio/StudioSupabaseSignInPanel", () => ({
  StudioSupabaseSignInPanel: () => null
}));
vi.mock("@/app/components/auth/SupporterSignInPanel", () => ({
  SupporterSignInPanel: () => null
}));
vi.mock("@/app/components/InstallExtensionPrompt", () => ({
  InstallExtensionPrompt: () => null
}));
vi.mock("@/app/components/relay-logo-animation", () => ({
  default: () => null
}));
vi.mock("@/lib/patreon-patron-scopes", () => ({
  PATREON_PATRON_OAUTH_SCOPES: "identity"
}));
vi.mock("@/lib/patron-patron-redirect-uri", () => ({
  patronPatronOAuthRedirectUri: () => ""
}));
vi.mock("@/lib/patron-oauth-state", () => ({
  encodePatronOAuthNonce: () => ""
}));

import { StepClaimHandleAndGo } from "../../web/app/components/onboarding/step-panels";
import { RelayApiError } from "@/lib/relay-api";

describe("<StepClaimHandleAndGo />", () => {
  beforeEach(() => {
    fetchCreatorPublicSlug.mockReset();
    patchCreatorPublicSlug.mockReset();
    getCreatorProfile.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("pre-fills from public slug API and saves via patch", async () => {
    fetchCreatorPublicSlug.mockResolvedValue({
      public_slug: "studio",
      slug_source: "allocated"
    });
    getCreatorProfile.mockResolvedValue({
      public_slug: "studio",
      slug_source: "allocated",
      patreon_campaign_id: null,
      username: null,
      username_norm: null,
      display_name: null,
      avatar_url: null,
      banner_url: null,
      bio: null,
      discipline: null,
      needs_setup: true
    });
    patchCreatorPublicSlug.mockResolvedValue({
      public_slug: "my-vanity",
      slug_source: "user_chosen"
    });
    const onFinish = vi.fn();

    render(<StepClaimHandleAndGo onFinish={onFinish} />);

    await waitFor(() => {
      const el = document.getElementById("onboarding-handle") as HTMLInputElement;
      expect(el?.value).toBe("studio");
    });

    const input = document.getElementById("onboarding-handle") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "my-vanity" } });

    fireEvent.click(screen.getByRole("button", { name: /take me to my gallery/i }));

    await waitFor(() => {
      expect(patchCreatorPublicSlug).toHaveBeenCalledWith("my-vanity");
    });
    expect(window.localStorage.getItem("relay_public_slug")).toBe("my-vanity");
    expect(onFinish).toHaveBeenCalled();
  });

  it("shows conflict message on 409", async () => {
    fetchCreatorPublicSlug.mockResolvedValue({
      public_slug: "one",
      slug_source: "user_chosen"
    });
    getCreatorProfile.mockResolvedValue(null);
    patchCreatorPublicSlug.mockRejectedValue(new RelayApiError("taken", 409));

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      const el = document.getElementById("onboarding-handle") as HTMLInputElement;
      expect(el?.value).toBe("one");
    });

    fireEvent.click(screen.getByRole("button", { name: /take me to my gallery/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent ?? "").toMatch(/already taken/i);
    });
  });
});
