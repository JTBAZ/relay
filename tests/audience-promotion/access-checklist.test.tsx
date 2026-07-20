/** @vitest-environment happy-dom */

/**
 * Slice 2 — Access checklist: Layer C visibility vs Layer A audience-access isolation.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../../web/lib/relay-api";

const relayFetch = vi.fn();
const fetchRelayComposeTiers = vi.fn();
const patchPostAudienceAccess = vi.fn();

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/lib/relay-api")>();
  return {
    ...actual,
    relayFetch: (...args: unknown[]) => relayFetch(...args),
    fetchRelayComposeTiers: (...args: unknown[]) => fetchRelayComposeTiers(...args),
    patchPostAudienceAccess: (...args: unknown[]) => patchPostAudienceAccess(...args),
    fetchAudienceSimulation: vi.fn().mockResolvedValue({
      post_id: "relay_p_1",
      creator_id: "creator_1",
      gate: { is_public: true, tier_ids: [] },
      relay_visibility: "visible",
      is_mature: false,
      catalog_tiers: [],
      simulation: {
        personas: [
          { persona_key: "anonymous", label: "Public (logged out)", outcome: "allow" }
        ],
        gate_tier_ids: [],
        relay_visibility: "visible"
      },
      tier_preview_settings: null
    }),
    listCreatorDiscountCodes: vi.fn().mockResolvedValue([]),
    listPostMarketingOffers: vi.fn().mockResolvedValue([])
  };
});

vi.mock("@/lib/relay-native-staging-upload", () => ({
  uploadFileToRelayStaging: vi.fn().mockResolvedValue({ media_id: "staged_promo" })
}));

vi.mock("../../web/app/components/distribution/PreviewizerOverlay", () => ({
  PreviewizerOverlay: () => null
}));

import RelayVisibilityChecklist from "../../web/app/components/studio/RelayVisibilityChecklist";
import MinimumTierAccessEditor from "../../web/app/components/studio/MinimumTierAccessEditor";
import AudiencePromotionPanel from "../../web/app/components/studio/AudiencePromotionPanel";

function galleryItem(
  overrides: Partial<GalleryItem> & Pick<GalleryItem, "media_id" | "post_id" | "visibility">
): GalleryItem {
  return {
    title: "Access post",
    description: "",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: ["patreon_tier_basic"],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/th",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

describe("Slice 2 — RelayVisibilityChecklist", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("POSTs /gallery/visibility for every media target and never calls audience-access", async () => {
    const items = [
      galleryItem({ media_id: "m1", post_id: "relay_p_1", visibility: "visible" }),
      galleryItem({ media_id: "m2", post_id: "relay_p_1", visibility: "visible" })
    ];
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    relayFetch.mockResolvedValue({});

    render(
      <RelayVisibilityChecklist
        creatorId="creator_1"
        postItems={items}
        studioWriteBlocked={false}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "Hidden" }));

    await waitFor(() => {
      expect(relayFetch).toHaveBeenCalled();
    });

    for (const call of relayFetch.mock.calls) {
      expect(call[0]).toBe("/api/v1/gallery/visibility");
      const body = JSON.parse(String(call[1].body));
      expect(body).not.toHaveProperty("tier_ids");
      expect(body.visibility).toBe("hidden");
    }
    const targets = relayFetch.mock.calls.flatMap((c) =>
      JSON.parse(String(c[1].body)).media_targets.map((t: { media_id: string }) => t.media_id)
    );
    expect(targets.sort()).toEqual(["m1", "m2"]);
    expect(patchPostAudienceAccess).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });

  it("disables writes when studioWriteBlocked", () => {
    render(
      <RelayVisibilityChecklist
        creatorId="creator_1"
        postItems={[galleryItem({ media_id: "m1", post_id: "p1", visibility: "visible" })]}
        studioWriteBlocked
        onRefresh={vi.fn()}
      />
    );
    expect((screen.getByRole("switch", { name: "Hidden" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole("switch", { name: "Adult (18+)" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe("Slice 2 — MinimumTierAccessEditor", () => {
  beforeEach(() => {
    fetchRelayComposeTiers.mockResolvedValue({
      tiers: [
        {
          tier_id: "prisma_basic",
          relay_tier_id: "patreon_tier_basic",
          title: "Basic",
          amount_cents: 500,
          campaign_id: "c1"
        },
        {
          tier_id: "prisma_pro",
          relay_tier_id: "patreon_tier_pro",
          title: "Pro",
          amount_cents: 1500,
          campaign_id: "c1"
        }
      ]
    });
    patchPostAudienceAccess.mockResolvedValue({
      audience: { post_id: "relay_p_1", is_public: false, tier_ids: ["prisma_pro"] }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves via audience-access only after inline review, never visibility", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <MinimumTierAccessEditor
        creatorId="creator_1"
        postId="relay_p_1"
        accessTiers={[{ tier_id: "patreon_tier_basic", title: "Basic" }]}
        studioWriteBlocked={false}
        onRefresh={onRefresh}
      />
    );

    await screen.findByText("Basic");
    const radios = screen.getAllByRole("radio");
    // Public, Basic, Pro (amount-sorted)
    fireEvent.click(radios[2]!);
    fireEvent.click(screen.getByRole("button", { name: /Review & save/i }));
    expect(await screen.findByText(/Confirm access change/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save access/i }));

    await waitFor(() => {
      expect(patchPostAudienceAccess).toHaveBeenCalledWith({
        relayCreatorId: "creator_1",
        postId: "relay_p_1",
        is_public: false,
        tier_ids: ["prisma_pro"]
      });
    });
    expect(relayFetch).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe("Slice 2 — AudiencePromotionPanel mount", () => {
  beforeEach(() => {
    fetchRelayComposeTiers.mockResolvedValue({ tiers: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("mounts both access blocks under the permission headline", async () => {
    render(
      <AudiencePromotionPanel
        creatorId="creator_1"
        postId="relay_p_1"
        postItems={[galleryItem({ media_id: "m1", post_id: "relay_p_1", visibility: "visible" })]}
        selectedItem={galleryItem({ media_id: "m1", post_id: "relay_p_1", visibility: "visible" })}
        tiers={[]}
        studioWriteBlocked={false}
        onRefresh={async () => undefined}
      />
    );

    expect(screen.getByText("Relay visibility ≠ Patreon access")).toBeTruthy();
    expect(document.body.querySelector("[data-relay-visibility-checklist]")).toBeTruthy();
    expect(document.body.querySelector("[data-minimum-tier-access-editor]")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Access" }).getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(screen.getByRole("tab", { name: "Simulator" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Promotion" })).toBeTruthy();
  });
});
