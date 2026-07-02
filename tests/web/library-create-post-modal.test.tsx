/** @vitest-environment happy-dom */

/**
 * LibraryCreatePostModal — compose-state → onPublish mapping (form behavior only, no network).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LibraryCreatePostModal, {
  LIBRARY_CREATE_POST_PUBLIC_TIER,
  type PostDraft
} from "../../web/app/components/LibraryCreatePostModal";
import type { ImportBinItem } from "../../web/app/components/LibraryImportBay";
import type { TierFacet } from "../../web/lib/relay-api";

const TIER_FACETS: TierFacet[] = [
  {
    tier_id: "tier_pk_supporter",
    relay_tier_id: "patreon_tier_supporter",
    title: "Supporter",
    amount_cents: 500,
    campaign_id: "camp_1"
  },
  {
    tier_id: "tier_pk_studio",
    relay_tier_id: "patreon_tier_studio",
    title: "Studio",
    amount_cents: 1500,
    campaign_id: "camp_1"
  }
];

const INITIAL_MEDIA: ImportBinItem[] = [
  {
    id: "media_staged_1",
    src: null,
    mimeType: "image/png",
    filename: "capture-1.png",
    timestamp: new Date("2026-06-01T12:00:00Z"),
    source: "discord" as ImportBinItem["source"],
    serverStaged: true
  }
];

function renderModal(overrides: { onPublish?: (d: PostDraft) => void | boolean | Promise<void | boolean>; onClose?: () => void } = {}) {
  const onPublish = overrides.onPublish ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const utils = render(
    <LibraryCreatePostModal
      open
      initialMedia={INITIAL_MEDIA}
      tierFacets={TIER_FACETS}
      collections={[]}
      onClose={onClose}
      onPublish={onPublish}
    />
  );
  return { onPublish, onClose, ...utils };
}

describe("<LibraryCreatePostModal />", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("disables Publish until a title is entered", () => {
    renderModal();
    const publishBtn = screen.getByRole("button", { name: "Publish Post" }) as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My new post" } });
    expect(publishBtn.disabled).toBe(false);
  });

  it("publishes with the entered title, selected tier, and staged media, then closes", async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onPublish, onClose });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tier-gated drop" } });
    fireEvent.click(screen.getByLabelText(/Supporter/));
    fireEvent.click(screen.getByRole("button", { name: "Publish Post" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    const draft = onPublish.mock.calls[0]![0] as PostDraft;
    expect(draft.title).toBe("Tier-gated drop");
    expect(draft.tierId).toBe("tier_pk_supporter");
    expect(draft.media.map((m) => m.id)).toEqual(["media_staged_1"]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("defaults to the Public tier and stays open when onPublish returns false", async () => {
    const onPublish = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    renderModal({ onPublish, onClose });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Open web post" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish Post" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    const draft = onPublish.mock.calls[0]![0] as PostDraft;
    expect(draft.tierId).toBe(LIBRARY_CREATE_POST_PUBLIC_TIER);
    expect(onClose).not.toHaveBeenCalled();
  });
});
