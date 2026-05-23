/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WhatYouMissedCarousel } from "../../web/components/patron/relay/what-you-missed-carousel";
import type { LockedFeedPost } from "../../web/lib/relay-fixtures";

const lockedPosts: LockedFeedPost[] = [
  {
    id: "locked_1",
    creator: {
      id: "cr_mara",
      handle: "maravisuals",
      displayName: "Mara Osei",
      discipline: "Photographer",
      avatarUrl: "/placeholder.svg?height=40&width=40",
      isFollowed: true,
      followerCount: 0,
      postCount: 0,
      onRelay: true,
      patronTierLabel: "Supporter"
    },
    title: "Contact sheet: Lisbon night market",
    mediaType: "photo",
    publishedAt: "2026-05-21T12:00:00.000Z",
    tierLabel: "Studio"
  }
];

describe("WhatYouMissedCarousel", () => {
  afterEach(() => cleanup());

  it("renders locked posts as an unobtrusive followed-creator carousel", () => {
    render(<WhatYouMissedCarousel posts={lockedPosts} />);

    expect(screen.getByRole("heading", { name: /^Available at higher tiers$/i })).toBeTruthy();
    expect(screen.getByText("What you missed")).toBeTruthy();
    expect(screen.getByText("Contact sheet: Lisbon night market")).toBeTruthy();
    expect(screen.getByText("Mara Osei")).toBeTruthy();
    expect(screen.getByText(/Tier: Studio required/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /unlock at studio tier/i })).toBeTruthy();
    expect(screen.getByText("Photo")).toBeTruthy();
    expect(screen.getByLabelText("Locked posts from creators you follow")).toBeTruthy();
  });

  it("renders nothing when there are no locked posts", () => {
    const { container } = render(<WhatYouMissedCarousel posts={[]} />);
    expect(container.textContent).toBe("");
  });
});
