/** @vitest-environment happy-dom */

/**
 * Slice 1 — Hero Access mounts Audience & Promotion in place; never opens legacy settings.
 * @see docs/studio/AUDIENCE_PROMOTION_CONVERSION.md
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../../web/lib/relay-api";
import type { HeroInspectKey } from "../../web/lib/hero-inspect-data";

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/lib/relay-api")>();
  return {
    ...actual,
    fetchPerformanceWorkBundle: vi.fn().mockResolvedValue(null),
    fetchPerformanceWorkInstances: vi.fn().mockResolvedValue(null),
    requestPlatformInstanceRefresh: vi.fn(),
    fetchAudienceSimulation: vi.fn().mockResolvedValue({
      post_id: "relay_p_shell",
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
    fetchRelayComposeTiers: vi.fn().mockResolvedValue({ tiers: [] }),
    listCreatorDiscountCodes: vi.fn().mockResolvedValue([]),
    listCreatorTierPromotionDefaults: vi.fn().mockResolvedValue([]),
    listPostMarketingOffers: vi.fn().mockResolvedValue([])
  };
});

import HeroInspectOverlay from "../../web/app/components/studio/HeroInspectOverlay";

function galleryItem(
  overrides: Partial<GalleryItem> & Pick<GalleryItem, "media_id" | "post_id">
): GalleryItem {
  return {
    title: "Audience shell post",
    description: "",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: [],
    mime_type: "image/png",
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/th",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

function renderHero(opts: {
  heroKey?: HeroInspectKey;
  onClose?: () => void;
  postItems?: GalleryItem[];
  preview?: GalleryItem;
}) {
  const preview =
    opts.preview ??
    galleryItem({ media_id: "m1", post_id: "relay_p_shell", title: "Shell post" });
  const heroKey: HeroInspectKey = opts.heroKey ?? {
    creative_work_id: null,
    post_id: "relay_p_shell"
  };
  const onClose = opts.onClose ?? vi.fn();
  const postItems = opts.postItems ?? [preview];

  const utils = render(
    <HeroInspectOverlay
      open
      heroKey={heroKey}
      preview={preview}
      postItems={postItems}
      creatorId="creator_1"
      tiers={[]}
      studioWriteBlocked={false}
      onRefresh={async () => undefined}
      onClose={onClose}
      onGapFill={vi.fn()}
    />
  );
  return { onClose, preview, ...utils };
}

async function openAccessTray() {
  fireEvent.click(screen.getByTitle("Access"));
  await waitFor(() => {
    expect(screen.getByText("Audience & Promotion")).toBeTruthy();
  });
}

async function openAudiencePromotion() {
  await openAccessTray();
  fireEvent.click(screen.getByText("Audience & Promotion"));
  await waitFor(() => {
    expect(document.body.querySelector("[data-audience-promotion-panel]")).toBeTruthy();
  });
}

function getTab(name: "Access" | "Simulator" | "Promotion") {
  return screen.getByRole("tab", { name });
}

async function selectAudienceTab(name: "Access" | "Simulator" | "Promotion") {
  fireEvent.click(getTab(name));
  await waitFor(() => {
    expect(getTab(name).getAttribute("aria-selected")).toBe("true");
  });
}

describe("Slice 1 — Hero Audience & Promotion shell", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Access toggles Audience & Promotion in place without legacy settings entry", async () => {
    renderHero({});

    await waitFor(() => {
      expect(document.body.querySelector('[data-hero-workspace-mode="overview"]')).toBeTruthy();
    });

    await openAccessTray();
    fireEvent.click(screen.getByText("Audience & Promotion"));

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-hero-workspace-mode="audience_promotion"]')
      ).toBeTruthy();
      expect(document.body.querySelector("[data-audience-promotion-panel]")).toBeTruthy();
    });
    expect(screen.queryByText(/^Post settings$/)).toBeNull();
    expect(screen.queryByText("Post settings (legacy)")).toBeNull();

    fireEvent.click(screen.getByTitle("Audience & Promotion (active)"));
    fireEvent.click(screen.getByText("Back to packaging"));

    await waitFor(() => {
      expect(document.body.querySelector('[data-hero-workspace-mode="overview"]')).toBeTruthy();
      expect(document.body.querySelector("[data-audience-promotion-panel]")).toBeNull();
    });
  });

  it("resets workspace mode to overview when the Hero post key changes", async () => {
    const { rerender } = renderHero({});

    await openAccessTray();
    fireEvent.click(screen.getByText("Audience & Promotion"));
    await waitFor(() => {
      expect(
        document.body.querySelector('[data-hero-workspace-mode="audience_promotion"]')
      ).toBeTruthy();
    });

    const nextKey: HeroInspectKey = {
      creative_work_id: null,
      post_id: "relay_p_other"
    };
    const nextPreview = galleryItem({
      media_id: "m2",
      post_id: "relay_p_other",
      title: "Other post"
    });
    rerender(
      <HeroInspectOverlay
        open
        heroKey={nextKey}
        preview={nextPreview}
        postItems={[nextPreview]}
        creatorId="creator_1"
        tiers={[]}
        studioWriteBlocked={false}
        onRefresh={async () => undefined}
        onClose={vi.fn()}
        onGapFill={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(document.body.querySelector('[data-hero-workspace-mode="overview"]')).toBeTruthy();
      expect(document.body.querySelector("[data-audience-promotion-panel]")).toBeNull();
    });
  });

  it("does not expose legacy Post settings under More (G9)", async () => {
    renderHero({});

    fireEvent.click(screen.getByTitle("More"));
    expect(screen.queryByText("Post settings (legacy)")).toBeNull();
    expect(screen.getByText("Close")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Access"));
    expect(await screen.findByText("Audience & Promotion")).toBeTruthy();
    expect(screen.queryByText("Post settings (legacy)")).toBeNull();
  });

  it("preserves Close from More while Access is in audience mode", async () => {
    const onClose = vi.fn();
    renderHero({ onClose });

    await openAudiencePromotion();
    await selectAudienceTab("Simulator");
    expect(document.body.querySelector("[data-audience-simulator-tab]")).toBeTruthy();

    fireEvent.click(screen.getByTitle("More"));
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes Access | Simulator | Promotion tabs with a single scrollable panel body", async () => {
    renderHero({});
    await openAudiencePromotion();

    const access = getTab("Access");
    const simulator = getTab("Simulator");
    const promotion = getTab("Promotion");
    expect(access.getAttribute("aria-selected")).toBe("true");
    expect(simulator.getAttribute("aria-selected")).toBe("false");
    expect(promotion.getAttribute("aria-selected")).toBe("false");

    const panel = document.body.querySelector("[data-audience-promotion-tabpanel]");
    expect(panel).toBeTruthy();
    expect(panel?.className).toMatch(/overflow-y-auto/);
    expect(panel?.className).toMatch(/overscroll-contain/);
    expect(panel?.getAttribute("aria-label")).toBe("Audience & Promotion — Access");

    const rail = document.body.querySelector('[data-hero-right-rail="audience_promotion"]');
    expect(rail).toBeTruthy();
    expect((rail as HTMLElement).style.height).toMatch(/340/);
    expect(rail?.className).toMatch(/overflow-hidden/);

    await selectAudienceTab("Promotion");
    expect(screen.getByText("Discount codes")).toBeTruthy();
    expect(screen.getByText("Offer for selected persona")).toBeTruthy();
    expect(screen.queryByTestId("create-promo-preview")).toBeNull();
    expect(screen.queryByTestId("cross-post-with-teaser")).toBeNull();
    expect(panel?.getAttribute("aria-label")).toBe("Audience & Promotion — Promotion");

    await selectAudienceTab("Simulator");
    expect(document.body.querySelector("[data-audience-simulator-section]")).toBeTruthy();
    expect(panel?.getAttribute("aria-label")).toBe("Audience & Promotion — Simulator");

    await selectAudienceTab("Access");
    expect(screen.getByText(/ADR-004/i)).toBeTruthy();
  });

  it("supports arrow-key tab navigation and reduced-motion data branch", async () => {
    renderHero({});
    await openAudiencePromotion();

    const access = getTab("Access");
    access.focus();
    fireEvent.keyDown(access.closest('[role="tablist"]')!, { key: "ArrowRight" });
    await waitFor(() => {
      expect(getTab("Simulator").getAttribute("aria-selected")).toBe("true");
    });
    expect(document.activeElement).toBe(getTab("Simulator"));

    fireEvent.keyDown(getTab("Simulator").closest('[role="tablist"]')!, { key: "End" });
    await waitFor(() => {
      expect(getTab("Promotion").getAttribute("aria-selected")).toBe("true");
    });

    fireEvent.keyDown(getTab("Promotion").closest('[role="tablist"]')!, { key: "Home" });
    await waitFor(() => {
      expect(getTab("Access").getAttribute("aria-selected")).toBe("true");
    });

    const panelRoot = document.body.querySelector("[data-audience-promotion-panel]");
    expect(panelRoot?.getAttribute("data-reduced-motion")).toBe("0");
    expect(document.body.querySelector('[data-audience-tab-motion="access"]')).toBeTruthy();
  });

  it("does not expose marketing Previewizer entry points on the Promotion tab", async () => {
    renderHero({});
    await openAudiencePromotion();
    await selectAudienceTab("Promotion");

    fireEvent.click(screen.getByText("Offer for selected persona"));
    await waitFor(() => {
      expect(document.body.querySelector("[data-promotion-studio]")).toBeTruthy();
    });

    expect(screen.queryByTestId("create-promo-preview")).toBeNull();
    expect(screen.queryByTestId("promo-teaser-attached")).toBeNull();
    expect(screen.queryByTestId("cross-post-with-teaser")).toBeNull();
    expect(screen.queryByTestId("previewizer-overlay-mock")).toBeNull();
    expect(screen.queryByText(/Create promo preview/i)).toBeNull();
    expect(screen.queryByText(/Replace promo preview/i)).toBeNull();
  });
});
