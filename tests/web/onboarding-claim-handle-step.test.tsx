/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorPublicSlug = vi.fn();
const patchCreatorPublicSlug = vi.fn();
const getCreatorProfile = vi.fn();
const getCreatorPatronTierSummary = vi.fn();
const fetchRelayComposeTiers = vi.fn();
const fetchCreatorOnboarding = vi.fn();
const fetchCreatorGalleryFacets = vi.fn();
const postPatreonScrape = vi.fn();
const patchRelayUsername = vi.fn();
const probeRelayExtensionStatus = vi.fn();

const STUB_ONBOARDING_BASE = {
  creator_id: "rcx_test",
  step: "connected" as const,
  metadata: null,
  updated_at: new Date().toISOString(),
  import_progress: null,
  sync_health: {
    status: "unknown" as const,
    last_success_at: null,
    last_error: null,
    campaign_id: null,
    message_key: "sync_health.unknown",
  },
};

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
    fetchCreatorOnboarding: (...args: unknown[]) => fetchCreatorOnboarding(...args),
    fetchCreatorGalleryFacets: (...args: unknown[]) => fetchCreatorGalleryFacets(...args),
    postPatreonScrape: (...args: unknown[]) => postPatreonScrape(...args),
    postPilotUxSimulateMediaImport: vi.fn(),
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
    patchRelayUsername: (...args: unknown[]) => patchRelayUsername(...args),
  };
});

vi.mock("@/lib/extension-store-urls", () => ({
  getExtensionStoreLinks: () => ({ chrome: null, edge: null, firefox: null }),
  hasAnyExtensionStoreLink: () => false,
}));

vi.mock("@/app/components/studio/StudioSupabaseSignInPanel", () => ({
  StudioSupabaseSignInPanel: () => null
}));
vi.mock("@/app/components/auth/SupporterSignInPanel", () => ({
  SupporterSignInPanel: () => null
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
vi.mock("@/lib/relay-extension-messaging", () => ({
  probeRelayExtensionStatus: (...args: unknown[]) => probeRelayExtensionStatus(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/pilot-ux-dev-accounts", () => ({
  pilotUxDevLoginEnabled: () => true,
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID: "rcx_pilot_dev_onboarding",
}));

import { StepClaimHandleAndGo } from "../../web/app/components/onboarding/step-panels";

describe("<StepClaimHandleAndGo />", () => {
  beforeEach(() => {
    fetchCreatorPublicSlug.mockReset();
    patchCreatorPublicSlug.mockReset();
    getCreatorProfile.mockReset();
    getCreatorPatronTierSummary.mockReset();
    fetchRelayComposeTiers.mockReset();
    fetchCreatorOnboarding.mockReset();
    fetchCreatorGalleryFacets.mockReset();
    postPatreonScrape.mockReset();
    patchRelayUsername.mockReset();
    probeRelayExtensionStatus.mockReset();
    window.localStorage.clear();

    fetchRelayComposeTiers.mockResolvedValue({ tiers: [] });
    fetchCreatorOnboarding.mockResolvedValue(STUB_ONBOARDING_BASE);
    fetchCreatorGalleryFacets.mockResolvedValue({ export_media_count: 0 });
    probeRelayExtensionStatus.mockResolvedValue({ ok: false, reason: "no_extension_ids" });
    getCreatorProfile.mockResolvedValue({
      public_slug: "test",
      slug_source: "allocated",
      patreon_campaign_id: null,
      username: null,
      username_norm: null,
      display_name: null,
      avatar_url: null,
      banner_url: null,
      bio: null,
      discipline: null,
      needs_setup: true,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows extension connection CTA when extension not installed (no store URLs)", async () => {
    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByText(/Sync & Review/i)).toBeTruthy();
    });
    // No extension IDs configured → ctaState = install_extension → label = "Connect extension"
    expect(screen.getByRole("link", { name: /Connect extension/i })).toBeTruthy();
  });

  it("shows 'Connect Extension →' CTA when extension present but no grant", async () => {
    probeRelayExtensionStatus.mockResolvedValue({
      ok: true,
      extensionId: "ext-id",
      hasGrant: false,
      relayCreatorId: null,
      patreonCookiePresent: false,
      lastSyncAt: null,
      lastSyncStatus: null,
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Connect Extension →/i })).toBeTruthy();
    });
  });

  it("shows 'Open Patreon to sync session' CTA when grant exists but no cookie", async () => {
    probeRelayExtensionStatus.mockResolvedValue({
      ok: true,
      extensionId: "ext-id",
      hasGrant: true,
      relayCreatorId: "rcx_test",
      patreonCookiePresent: false,
      lastSyncAt: null,
      lastSyncStatus: null,
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Open Patreon to sync session/i })).toBeTruthy();
    });
    expect(screen.getByText(/sync.*extension popup/i)).toBeTruthy();
  });

  it("shows 'Import Media' button when extension connected and cookie synced", async () => {
    probeRelayExtensionStatus.mockResolvedValue({
      ok: true,
      extensionId: "ext-id",
      hasGrant: true,
      relayCreatorId: "rcx_test",
      patreonCookiePresent: true,
      lastSyncAt: null,
      lastSyncStatus: null,
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Import Media/i })).toBeTruthy();
    });
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
        { tier_id: "t1", title: "Supporter", amount_cents: 500, patron_count: 89 },
        { tier_id: "t2", title: "Studio", amount_cents: 1500, patron_count: 38 },
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
    expect(screen.getAllByText("Complete")).toHaveLength(3);
  });

  it("shows pending media signal and Not connected yet copy when connected but no import", async () => {
    window.localStorage.setItem("relay_creator_id", "rcx_test_creator");
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
    fetchRelayComposeTiers.mockResolvedValue({
      tiers: [{ tier_id: "t1", title: "Supporter", amount_cents: 500 }]
    });
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

  it("shows 'Review your Library' CTA when media is complete", async () => {
    window.localStorage.setItem("relay_creator_id", "rcx_complete");
    fetchCreatorOnboarding.mockResolvedValue({
      ...STUB_ONBOARDING_BASE,
      import_progress: {
        last_post_scrape_finished_at: new Date().toISOString(),
        last_post_scrape_ok: true,
        last_post_scrape_posts_written: 42,
      },
      sync_health: {
        status: "healthy" as const,
        last_success_at: new Date().toISOString(),
        last_error: null,
        campaign_id: "cid",
        message_key: "sync_health.healthy",
      },
    });
    fetchCreatorGalleryFacets.mockResolvedValue({ export_media_count: 42 });
    getCreatorProfile.mockResolvedValue({
      public_slug: "complete",
      slug_source: "user_chosen",
      patreon_campaign_id: "cid",
      username: "complete",
      username_norm: "complete",
      display_name: "Complete",
      avatar_url: null,
      banner_url: null,
      bio: null,
      discipline: null,
      needs_setup: false,
    });

    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Review your Library →/i })).toBeTruthy();
    });
    expect(screen.getAllByText("Complete", { selector: "span" }).length).toBeGreaterThanOrEqual(3);
  });

  it("shows advanced fallback disclosure in all states", async () => {
    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByText(/Advanced: manual import options/i)).toBeTruthy();
    });
  });

  it("shows dev simulate media import button for onboarding walkthrough account", async () => {
    window.localStorage.setItem("relay_creator_id", "rcx_pilot_dev_onboarding");
    render(<StepClaimHandleAndGo />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Simulate media import \(dev\)/i })).toBeTruthy();
    });
  });
});
