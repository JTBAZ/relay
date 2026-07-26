/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putCreatorPromoSlots = vi.fn();
const fetchCreatorGalleryItems = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/relay-api")>("@/lib/relay-api");
  return {
    ...actual,
    putCreatorPromoSlots: (...args: unknown[]) => putCreatorPromoSlots(...args),
    fetchCreatorGalleryItems: (...args: unknown[]) => fetchCreatorGalleryItems(...args),
    RELAY_API_BASE: "http://localhost:8787"
  };
});

import PromoPiecesPanel, { compactSlotsForPut } from "../../web/app/studio/promos/PromoPiecesPanel";
import {
  EXPECTED_PUT_AFTER_REMOVE_MIDDLE,
  EXPECTED_PUT_THREE_POSTS,
  FIXTURE_HIDDEN_REVIEW_ROWS,
  FIXTURE_LEGACY_MEDIA_SLOT,
  FIXTURE_LEGACY_MEDIA_UNRESOLVED,
  FIXTURE_LINKED_SET_MEMBERS,
  FIXTURE_MULTI_ASSET_ROWS,
  FIXTURE_NORMAL_POST,
  FIXTURE_PAGE_1_CURSOR,
  FIXTURE_PAGE_1_ITEMS,
  FIXTURE_PAGE_2_ITEMS,
  FIXTURE_SHADOW_COVER
} from "../../web/app/studio/promos/promo-pieces-fixtures";
import type { CreatorPromoSlotRow } from "../../web/lib/relay-api";

const SLOT_A: CreatorPromoSlotRow = {
  promo_piece_id: "pp_a",
  slot_rank: 1,
  target_kind: "post",
  target_id: "post_normal",
  post_id: "post_normal",
  title: "Normal Post",
  thumb_url_path: "/thumb/media_normal"
};

const SLOT_B: CreatorPromoSlotRow = {
  promo_piece_id: "pp_b",
  slot_rank: 2,
  target_kind: "post",
  target_id: "post_carousel",
  post_id: "post_carousel",
  title: "Carousel Post",
  thumb_url_path: "/thumb/media_carousel_a"
};

const SLOT_C: CreatorPromoSlotRow = {
  promo_piece_id: "pp_c",
  slot_rank: 3,
  target_kind: "post",
  target_id: "post_ls_1",
  post_id: "post_ls_1",
  title: "Linked Member A",
  thumb_url_path: "/thumb/media_ls_1"
};

function renderPanel(
  slots: CreatorPromoSlotRow[],
  handlers?: {
    onSlotsChange?: ReturnType<typeof vi.fn>;
    onError?: ReturnType<typeof vi.fn>;
  }
) {
  const onSlotsChange = handlers?.onSlotsChange ?? vi.fn();
  const onError = handlers?.onError ?? vi.fn();
  render(
    <PromoPiecesPanel
      creatorId="cr_test"
      slots={slots}
      onSlotsChange={onSlotsChange}
      onError={onError}
    />
  );
  return { onSlotsChange, onError };
}

describe("VS1 promo pieces fixtures (characterization)", () => {
  it("covers normal, multi-asset, linked-set, hidden/review, pagination, and legacy media", () => {
    expect(FIXTURE_NORMAL_POST.post_id).toBe("post_normal");
    expect(new Set(FIXTURE_MULTI_ASSET_ROWS.map((r) => r.post_id)).size).toBe(1);
    expect(FIXTURE_MULTI_ASSET_ROWS).toHaveLength(2);
    expect(FIXTURE_LINKED_SET_MEMBERS.map((r) => r.post_id)).toEqual(["post_ls_1", "post_ls_2"]);
    expect(FIXTURE_LINKED_SET_MEMBERS.every((r) => r.is_default_bundle === false)).toBe(true);
    expect(FIXTURE_HIDDEN_REVIEW_ROWS.map((r) => r.visibility)).toEqual(["hidden", "review"]);
    expect(FIXTURE_SHADOW_COVER.shadow_cover).toBe(true);
    expect(FIXTURE_PAGE_1_ITEMS.length).toBeGreaterThan(0);
    expect(FIXTURE_PAGE_2_ITEMS.length).toBeGreaterThan(0);
    expect(FIXTURE_PAGE_1_CURSOR).toBe("cursor_page_2");
    expect(FIXTURE_LEGACY_MEDIA_SLOT.target_kind).toBe("media");
    expect(FIXTURE_LEGACY_MEDIA_SLOT.post_id).toBe("post_legacy");
    expect(FIXTURE_LEGACY_MEDIA_UNRESOLVED.post_id).toBeUndefined();
  });

  it("records expected full-set PUT payloads with post targets and compact ranks", () => {
    expect(EXPECTED_PUT_THREE_POSTS).toEqual([
      { slot_rank: 1, target_kind: "post", target_id: "post_normal" },
      { slot_rank: 2, target_kind: "post", target_id: "post_carousel" },
      { slot_rank: 3, target_kind: "post", target_id: "post_ls_1" }
    ]);
    expect(EXPECTED_PUT_AFTER_REMOVE_MIDDLE).toEqual([
      { slot_rank: 1, target_kind: "post", target_id: "post_normal" },
      { slot_rank: 2, target_kind: "post", target_id: "post_ls_1" }
    ]);
  });
});

describe("compactSlotsForPut", () => {
  it("compacts sparse ranks to 1…N for full-set PUT", () => {
    const sparse: CreatorPromoSlotRow[] = [
      { ...SLOT_C, slot_rank: 5 },
      { ...SLOT_A, slot_rank: 1 },
      { ...SLOT_B, slot_rank: 3 }
    ];
    expect(compactSlotsForPut(sparse)).toEqual(EXPECTED_PUT_THREE_POSTS);
  });
});

describe("<PromoPiecesPanel />", () => {
  beforeEach(() => {
    putCreatorPromoSlots.mockReset();
    fetchCreatorGalleryItems.mockReset();
    putCreatorPromoSlots.mockResolvedValue({ creator_id: "cr_test", slots: [] });
    fetchCreatorGalleryItems.mockResolvedValue({ items: [FIXTURE_NORMAL_POST], next_cursor: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows empty window and exact Add Post button below it", () => {
    renderPanel([]);
    expect(screen.getByText(/No promo pieces yet/i)).toBeTruthy();
    const windowEl = document.querySelector("[data-promo-pieces-window]");
    expect(windowEl).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: "Add Post" });
    expect(
      windowEl!.compareDocumentPosition(addBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("hero mode renders empty slot affordances without instructional copy", () => {
    render(
      <PromoPiecesPanel
        creatorId="cr_test"
        slots={[]}
        hero
        onSlotsChange={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.queryByText(/Five slots, one learning system/i)).toBeNull();
    expect(document.querySelector('[data-promos-pool-hero="1"]')).toBeTruthy();
    expect(document.querySelectorAll("[data-promo-add-slot]")).toHaveLength(5);
  });

  it("opens picker modal from Add Post", async () => {
    renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    expect(screen.getByRole("dialog", { name: /Add posts to your promo pool/i })).toBeTruthy();
    await waitFor(() => {
      expect(fetchCreatorGalleryItems).toHaveBeenCalled();
    });
  });

  it("renders discrete cards for populated slots with Promo marker", () => {
    renderPanel([SLOT_A, SLOT_B]);
    expect(screen.getByText("Normal Post")).toBeTruthy();
    expect(screen.getByText("Carousel Post")).toBeTruthy();
    expect(document.querySelectorAll("[data-promo-piece-card]")).toHaveLength(2);
    expect(screen.getAllByText("Promo")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add Post" })).toBeTruthy();
  });

  it("persists compacted ranks after remove", async () => {
    putCreatorPromoSlots.mockResolvedValue({
      creator_id: "cr_test",
      slots: [
        { ...SLOT_A, slot_rank: 1 },
        { ...SLOT_C, slot_rank: 2 }
      ]
    });
    const { onSlotsChange } = renderPanel([SLOT_A, SLOT_B, SLOT_C]);
    fireEvent.click(screen.getByRole("button", { name: /Remove Carousel Post from promo pieces/i }));
    await waitFor(() => {
      expect(putCreatorPromoSlots).toHaveBeenCalledWith(EXPECTED_PUT_AFTER_REMOVE_MIDDLE);
    });
    expect(onSlotsChange).toHaveBeenCalled();
  });

  it("keeps empty state after removing the final piece", async () => {
    putCreatorPromoSlots.mockResolvedValue({ creator_id: "cr_test", slots: [] });
    const { onSlotsChange } = renderPanel([SLOT_A]);
    fireEvent.click(screen.getByRole("button", { name: /Remove Normal Post from promo pieces/i }));
    await waitFor(() => {
      expect(putCreatorPromoSlots).toHaveBeenCalledWith([]);
    });
    expect(onSlotsChange).toHaveBeenCalledWith([]);
  });

  it("surfaces persist errors without claiming success", async () => {
    putCreatorPromoSlots.mockRejectedValue(new Error("save failed"));
    const { onSlotsChange, onError } = renderPanel([SLOT_A]);
    fireEvent.click(screen.getByRole("button", { name: /Remove Normal Post from promo pieces/i }));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("save failed");
    });
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it("shows unresolved legacy media warning", () => {
    renderPanel([FIXTURE_LEGACY_MEDIA_UNRESOLVED]);
    expect(screen.getByText(/Legacy media — unresolved post/i)).toBeTruthy();
  });

  it("Make Promos saves post targets and closes modal", async () => {
    putCreatorPromoSlots.mockResolvedValue({
      creator_id: "cr_test",
      slots: [{ ...SLOT_A, slot_rank: 1 }]
    });
    const { onSlotsChange } = renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByText("Normal Post")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Normal Post as promo piece/i }));
    fireEvent.click(screen.getByRole("button", { name: "Make Promos" }));
    await waitFor(() => {
      expect(putCreatorPromoSlots).toHaveBeenCalledWith([
        { slot_rank: 1, target_kind: "post", target_id: "post_normal" }
      ]);
    });
    expect(onSlotsChange).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("paginates all gallery pages in the picker", async () => {
    fetchCreatorGalleryItems
      .mockResolvedValueOnce({
        items: [FIXTURE_NORMAL_POST],
        next_cursor: FIXTURE_PAGE_1_CURSOR
      })
      .mockResolvedValueOnce({
        items: FIXTURE_LINKED_SET_MEMBERS,
        next_cursor: null
      });
    renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByText("Linked Member A")).toBeTruthy();
    });
    expect(fetchCreatorGalleryItems).toHaveBeenCalledTimes(2);
    expect(fetchCreatorGalleryItems.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        display: "post_primary",
        visibility: "visible",
        limit: 100
      })
    );
    expect(fetchCreatorGalleryItems.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ cursor: FIXTURE_PAGE_1_CURSOR })
    );
    expect(screen.getByText("Linked Member B")).toBeTruthy();
    expect(screen.getByText(/Linked · Teaser/i)).toBeTruthy();
  });

  it("enforces max five in the picker and keeps Make Promos label exact", async () => {
    fetchCreatorGalleryItems.mockResolvedValue({
      items: Array.from({ length: 6 }, (_, i) => ({
        ...FIXTURE_NORMAL_POST,
        media_id: `media_${i + 1}`,
        post_id: `post_${i + 1}`,
        title: `Piece ${i + 1}`,
        thumb_url_path: `/thumb/${i + 1}`
      })),
      next_cursor: null
    });
    renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByText("Piece 1")).toBeTruthy();
    });
    for (let i = 1; i <= 5; i += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`Add Piece ${i} as promo piece`, "i") })
      );
    }
    expect(screen.getByRole("button", { name: /Add Piece 6 as promo piece/i })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByText(/5 \/ 5 selected/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make Promos" })).toBeTruthy();
  });

  it("keeps modal open with error when Make Promos fails", async () => {
    putCreatorPromoSlots.mockRejectedValue(new Error("network down"));
    const { onSlotsChange } = renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByText("Normal Post")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Normal Post as promo piece/i }));
    fireEvent.click(screen.getByRole("button", { name: "Make Promos" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/network down/i)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it("closes modal on Escape", async () => {
    renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("preselects current promo pieces when the modal opens", async () => {
    fetchCreatorGalleryItems.mockResolvedValue({
      items: [FIXTURE_NORMAL_POST, ...FIXTURE_LINKED_SET_MEMBERS],
      next_cursor: null
    });
    renderPanel([SLOT_A]);
    fireEvent.click(screen.getByRole("button", { name: "Add Post" }));
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 5 selected/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /Remove Normal Post as promo piece/i }).getAttribute("aria-pressed")
    ).toBe("true");
  });
});
