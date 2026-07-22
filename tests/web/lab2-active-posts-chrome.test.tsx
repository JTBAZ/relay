/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActivePostPresenceCard from "@/app/components/ActivePostPresenceCard";
import LinkedSetCard from "@/app/components/studio/LinkedSetCard";
import type { GalleryItem } from "@/lib/relay-api";

vi.mock("@/app/components/PostAssetCarouselStrip", () => ({
  postCarouselMainVisual: () => ({ src: null, isVideo: false, relayProcessing: false })
}));

vi.mock("@/app/components/distribution/platform-presence-chips", () => ({
  CrosspostChipRow: () => <div data-testid="chips" />
}));

function makeItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    post_id: "post_1",
    media_id: "media_1",
    title: "Character drop",
    visibility: "public",
    published_at: "2026-07-14T12:00:00.000Z",
    tier_ids: [],
    shadow_cover: false,
    mime_type: "image/png",
    content_url_path: null,
    distribution_summary: {
      destinations: [
        {
          destination: "x",
          attempt_status: "posted",
          external_url: "https://x.com/example"
        }
      ]
    },
    ...overrides
  } as GalleryItem;
}

afterEach(() => {
  cleanup();
});

describe("lab2 Active Posts card chrome", () => {
  it("renders v0 GalleryCard chrome for a live post", () => {
    render(
      <ActivePostPresenceCard
        items={[makeItem()]}
        tierTitleById={{}}
        selected={false}
        flatIndex={0}
        aspectRatio="4 / 3"
        presentation="lab2"
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
        onFocusIndex={vi.fn()}
        onPresentClick={vi.fn()}
        onGhostClick={vi.fn()}
      />
    );

    const card = screen.getByRole("listitem");
    expect(card.hasAttribute("data-lab2-card")).toBe(true);
    expect(screen.getByText("Character drop")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getByText("X")).toBeTruthy();
    expect(screen.queryByText("No preview")).toBeNull();
  });

  it("renders linked sets as tinted v0 tiles, not empty mosaics", () => {
    const members = [
      {
        post_id: "post_a",
        title: "Test 1",
        group: { post_id: "post_a", items: [makeItem({ post_id: "post_a", title: "Test 1" })] }
      },
      {
        post_id: "post_b",
        title: "Test 3",
        group: {
          post_id: "post_b",
          items: [makeItem({ post_id: "post_b", title: "Test 3", media_id: "media_2" })]
        }
      }
    ];

    render(
      <LinkedSetCard
        creativeWorkId="cw_1"
        title="Collect test"
        memberCount={2}
        members={members as never}
        present={[{ destination: "patreon", external_url: null }]}
        missing={["x", "deviantart", "bluesky"]}
        selected={false}
        aspectRatio="4 / 3"
        presentation="lab2"
        onToggleSelect={vi.fn()}
        onOpenSummary={vi.fn()}
        onPresentClick={vi.fn()}
        onGhostClick={vi.fn()}
      />
    );

    const card = screen.getByRole("listitem");
    expect(card.hasAttribute("data-lab2-linked-set")).toBe(true);
    expect(screen.getByText("Collect test")).toBeTruthy();
    expect(screen.getByText("2 linked")).toBeTruthy();
    expect(screen.getByText("Pat")).toBeTruthy();
    expect(screen.queryByText("Test 1")).toBeNull();
    expect(screen.queryByText("Test 3")).toBeNull();
  });
});
