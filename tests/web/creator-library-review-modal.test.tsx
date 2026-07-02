/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorGalleryFacets = vi.fn();
const fetchCreatorGalleryItems = vi.fn();
const fetchCreatorOnboarding = vi.fn();
const fetchCreatorPromoSlots = vi.fn();
const fetchCreatorPostingGoal = vi.fn();
const putCreatorPromoSlots = vi.fn();
const putCreatorPostingGoal = vi.fn();
const patchCreatorOnboarding = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/relay-api")>("@/lib/relay-api");
  return {
    ...actual,
    fetchCreatorGalleryFacets: (...args: unknown[]) => fetchCreatorGalleryFacets(...args),
    fetchCreatorGalleryItems: (...args: unknown[]) => fetchCreatorGalleryItems(...args),
    fetchCreatorOnboarding: (...args: unknown[]) => fetchCreatorOnboarding(...args),
    fetchCreatorPromoSlots: (...args: unknown[]) => fetchCreatorPromoSlots(...args),
    fetchCreatorPostingGoal: (...args: unknown[]) => fetchCreatorPostingGoal(...args),
    putCreatorPromoSlots: (...args: unknown[]) => putCreatorPromoSlots(...args),
    putCreatorPostingGoal: (...args: unknown[]) => putCreatorPostingGoal(...args),
    patchCreatorOnboarding: (...args: unknown[]) => patchCreatorOnboarding(...args),
    RELAY_API_BASE: "http://localhost:8787",
  };
});

import { CreatorLibraryReviewModal } from "../../web/app/components/onboarding/CreatorLibraryReviewModal";

const STUB_ITEM = {
  media_id: "media_1",
  post_id: "post_1",
  title: "Sunset Study",
  published_at: "2026-01-01T00:00:00.000Z",
  tag_ids: [],
  tier_ids: [],
  has_export: true,
  processing_status: "READY" as const,
  export_status: "ready" as const,
  content_url_path: "/content/media_1",
  preview_url_path: "/preview/media_1",
  thumb_url_path: "/thumb/media_1",
  visibility: "visible" as const,
  collection_ids: [],
  collection_theme_tag_ids: [],
  mime_type: "image/png",
};

describe("<CreatorLibraryReviewModal />", () => {
  const onClose = vi.fn();
  const onComplete = vi.fn();

  beforeEach(() => {
    fetchCreatorGalleryFacets.mockReset();
    fetchCreatorGalleryItems.mockReset();
    fetchCreatorOnboarding.mockReset();
    fetchCreatorPromoSlots.mockReset();
    fetchCreatorPostingGoal.mockReset();
    putCreatorPromoSlots.mockReset();
    putCreatorPostingGoal.mockReset();
    patchCreatorOnboarding.mockReset();
    onClose.mockReset();
    onComplete.mockReset();

    fetchCreatorGalleryFacets.mockResolvedValue({
      tag_ids: [],
      tier_ids: ["tier_1"],
      tiers: [{ tier_id: "tier_1", title: "Supporter" }],
      tag_counts: {},
    });
    fetchCreatorGalleryItems.mockResolvedValue({ items: [STUB_ITEM], next_cursor: null });
    fetchCreatorOnboarding.mockResolvedValue({
      creator_id: "rcx_test",
      step: "import_started",
      metadata: null,
      updated_at: new Date().toISOString(),
      import_progress: null,
      sync_health: { status: "healthy", last_success_at: null, last_error: null, campaign_id: null, message_key: "sync_health.healthy" },
    });
    fetchCreatorPromoSlots.mockResolvedValue({ creator_id: "rcx_test", slots: [] });
    fetchCreatorPostingGoal.mockResolvedValue({
      goal: {
        creator_id: "rcx_test",
        monthly_post_target: 1,
        bonus_nudges_enabled: false,
        timezone: "UTC",
        enabled: true,
        is_default: true,
        updated_at: null,
      },
    });
    putCreatorPromoSlots.mockResolvedValue({ creator_id: "rcx_test", slots: [] });
    putCreatorPostingGoal.mockResolvedValue({
      goal: {
        creator_id: "rcx_test",
        monthly_post_target: 1,
        bonus_nudges_enabled: false,
        timezone: "UTC",
        enabled: true,
        is_default: false,
        updated_at: new Date().toISOString(),
      },
    });
    patchCreatorOnboarding.mockResolvedValue({
      creator_id: "rcx_test",
      step: "organized",
      metadata: { growth_goal: "discovery" },
      updated_at: new Date().toISOString(),
      import_progress: null,
      sync_health: { status: "healthy", last_success_at: null, last_error: null, campaign_id: null, message_key: "sync_health.healthy" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads gallery items and renders search grid", async () => {
    render(
      <CreatorLibraryReviewModal
        open
        creatorId="rcx_test"
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review my gallery/i }));

    await waitFor(() => {
      expect(screen.getByText("Sunset Study")).toBeTruthy();
    });
    expect(fetchCreatorGalleryItems).toHaveBeenCalled();
  });

  it("filters gallery list when search query changes", async () => {
    render(
      <CreatorLibraryReviewModal
        open
        creatorId="rcx_test"
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review my gallery/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search titles and tags/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(/Search titles and tags/i), {
      target: { value: "sunset" },
    });

    await waitFor(
      () => {
        expect(fetchCreatorGalleryItems).toHaveBeenCalledWith(
          expect.objectContaining({ creator_id: "rcx_test", q: "sunset" })
        );
      },
      { timeout: 1500 }
    );
  });

  it("requires promo selection before goal step and growth goal before continue", async () => {
    render(
      <CreatorLibraryReviewModal
        open
        creatorId="rcx_test"
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review my gallery/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Submit 0 pieces/i })).toBeTruthy();
    });

    const submitBtn = screen.getByRole("button", { name: /Submit 0 pieces/i });
    expect(submitBtn).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /Add Sunset Study as promo piece/i }));
    expect(screen.getByRole("button", { name: /Submit 1 piece/i })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: /Submit 1 piece/i }));

    const continueBtn = screen.getByRole("button", { name: /Continue to Library/i });
    expect(continueBtn).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /Audience discovery/i }));
    expect(continueBtn).toHaveProperty("disabled", false);
  });

  it("saves promo slots, growth goal metadata, and advances onboarding", async () => {
    render(
      <CreatorLibraryReviewModal
        open
        creatorId="rcx_test"
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review my gallery/i }));

    await waitFor(() => {
      expect(screen.getByText("Sunset Study")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add Sunset Study as promo piece/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit 1 piece/i }));
    fireEvent.click(screen.getByRole("button", { name: /Convert fans to patrons/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to Library/i }));

    await waitFor(() => {
      expect(putCreatorPromoSlots).toHaveBeenCalledWith([
        {
          slot_rank: 1,
          target_kind: "media",
          target_id: "media_1",
        },
      ]);
    });

    expect(putCreatorPostingGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        monthly_post_target: 1,
        bonus_nudges_enabled: false,
        timezone: expect.any(String),
      })
    );

    expect(patchCreatorOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "organized",
        metadata: expect.objectContaining({
          growth_goal: "conversion",
          posting_cadence_per_month: 1,
        }),
      })
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it("enforces max five promo selections", async () => {
    fetchCreatorGalleryItems.mockResolvedValue({
      items: Array.from({ length: 6 }, (_, i) => ({
        ...STUB_ITEM,
        media_id: `media_${i + 1}`,
        title: `Piece ${i + 1}`,
      })),
      next_cursor: null,
    });

    render(
      <CreatorLibraryReviewModal
        open
        creatorId="rcx_test"
        onClose={onClose}
        onComplete={onComplete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review my gallery/i }));

    await waitFor(() => {
      expect(screen.getByText("Piece 1")).toBeTruthy();
    });

    for (let i = 1; i <= 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`Add Piece ${i} as promo piece`, "i") }));
    }

    const sixth = screen.getByRole("button", { name: /Add Piece 6 as promo piece/i });
    expect(sixth).toHaveProperty("disabled", true);
    expect(screen.getByText(/5 \/ 5 selected/i)).toBeTruthy();
  });
});
