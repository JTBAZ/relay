/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorPublicSlug = vi.fn();
const patchCreatorPublicSlug = vi.fn();
const getCreatorProfile = vi.fn();
const getCreatorPatronTierSummary = vi.fn();
const fetchRelayComposeTiers = vi.fn();

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
    getCreatorPatronTierSummary: (...args: unknown[]) => getCreatorPatronTierSummary(...args),
    fetchRelayComposeTiers: (...args: unknown[]) => fetchRelayComposeTiers(...args),
    RelayApiError: StubRelayApiError,
    RELAY_CREATOR_ID_STORAGE_KEY: "relay_creator_id",
    RELAY_PUBLIC_SLUG_STORAGE_KEY: "relay_public_slug",
    RELAY_API_BASE: "http://localhost:8787",
    putRelayNativeUpload: vi.fn(),
    relayNativeUploadCommit: vi.fn(),
    relayNativeUploadInit: vi.fn(),
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

describe("<StepClaimHandleAndGo />", () => {
  beforeEach(() => {
    fetchCreatorPublicSlug.mockReset();
    patchCreatorPublicSlug.mockReset();
    getCreatorProfile.mockReset();
    getCreatorPatronTierSummary.mockReset();
    fetchRelayComposeTiers.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows import choices without gallery URL", async () => {
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
    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByText(/What Relay sees/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Gallery URL/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /import your media/i }));
    expect(await screen.findByText(/Media Sync/i)).toBeTruthy();
    expect(screen.getByText(/Manual Import/i)).toBeTruthy();
    expect(patchCreatorPublicSlug).not.toHaveBeenCalled();
  });

  it("shows patron snapshot and detected signals when Patreon is connected", async () => {
    window.localStorage.setItem("relay_creator_id", "rcx_pilot_dev_onboarding");
    fetchRelayComposeTiers.mockResolvedValue({
      tiers: [
        { tier_id: "t1", title: "Supporter", amount_cents: 500 },
        { tier_id: "t2", title: "Studio", amount_cents: 1500 }
      ]
    });
    getCreatorPatronTierSummary.mockResolvedValue({
      total_patrons: 127,
      free_patrons: 12,
      tiers: [
        {
          tier_id: "t1",
          title: "Supporter",
          amount_cents: 500,
          patron_count: 89
        },
        {
          tier_id: "t2",
          title: "Studio",
          amount_cents: 1500,
          patron_count: 38
        }
      ]
    });
    getCreatorProfile.mockResolvedValue({
      public_slug: "dev-onboarding",
      slug_source: "allocated",
      patreon_campaign_id: "pilot_patreon_campaign_onboarding",
      username: "studio",
      username_norm: "studio",
      display_name: "Studio",
      avatar_url: null,
      banner_url: null,
      bio: null,
      discipline: null,
      needs_setup: false
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByText(/Tiers Detected: Supporter \(\$5\), Studio \(\$15\)/i)).toBeTruthy();
    });
    expect(screen.getByText(/127 patrons in your synced membership snapshot/i)).toBeTruthy();
    expect(screen.getByText(/\$1,015\/mo detected/i)).toBeTruthy();
    expect(screen.getAllByText("Detected")).toHaveLength(3);
  });

  it("shows pending media signal when connected", async () => {
    fetchCreatorPublicSlug.mockResolvedValue({
      public_slug: "one",
      slug_source: "user_chosen"
    });
    getCreatorProfile.mockResolvedValue({
      public_slug: "one",
      slug_source: "user_chosen",
      patreon_campaign_id: "campaign_1",
      username: "one",
      username_norm: "one",
      display_name: "One",
      avatar_url: null,
      banner_url: null,
      bio: null,
      discipline: null,
      needs_setup: false
    });
    fetchRelayComposeTiers.mockResolvedValue({ tiers: [{ tier_id: "t1", title: "Supporter", amount_cents: 500 }] });
    getCreatorPatronTierSummary.mockResolvedValue({
      total_patrons: 0,
      free_patrons: 0,
      tiers: []
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByText("Media")).toBeTruthy();
    });
    expect(screen.getByText(/Not connected yet/i)).toBeTruthy();
  });
});
