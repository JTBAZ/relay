/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Lab3ScheduleDayRow } from "@/app/components/studio-lab3/Lab3ScheduleDayRow";
import {
  LAB3_ART_DAY_PX,
  LAB3_COMPACT_DAY_PX,
  LAB3_TEXT_DAY_PX
} from "@/app/components/studio-lab3/lab3-constants";
import type { ScheduleEvent } from "@/lib/schedule-rail-data";
import {
  artworkSrcFromGalleryItems,
  resolveMissingLab3Artwork
} from "@/lib/lab3-event-artwork";
import type { GalleryItem, GalleryPostDetail } from "@/lib/relay-api";

afterEach(() => {
  cleanup();
});

const event = (overrides: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: "ev_1",
  action: "post",
  title: "Long scheduled title that should stay readable",
  destination: "x",
  at: "2026-07-22T15:00:00.000Z",
  notify: true,
  status: "pending",
  post_id: "post_1",
  ...overrides
});

describe("Lab 3 adaptive day rows", () => {
  it("collapses empty days to a compact hairline", () => {
    render(
      <Lab3ScheduleDayRow
        day={3}
        events={[]}
        isToday={false}
        isPast
        isPulsing={false}
        timeZone="UTC"
        artworkByPostId={new Map()}
        highlightIds={new Set()}
        popSliceId={null}
        onOpenEvent={vi.fn()}
        onOpenOverflow={vi.fn()}
      />
    );
    const row = document.querySelector("[data-lab3-day-row]") as HTMLElement;
    expect(row.getAttribute("data-lab3-day-density")).toBe("compact");
    expect(row.style.height).toBe(`${LAB3_COMPACT_DAY_PX}px`);
  });

  it("expands scheduled days with resolvable art", () => {
    render(
      <Lab3ScheduleDayRow
        day={8}
        events={[event()]}
        isToday
        isPast={false}
        isPulsing={false}
        timeZone="UTC"
        artworkByPostId={new Map([["post_1", "/thumb/post_1.webp"]])}
        highlightIds={new Set()}
        popSliceId={null}
        onOpenEvent={vi.fn()}
        onOpenOverflow={vi.fn()}
      />
    );
    const row = document.querySelector("[data-lab3-day-row]") as HTMLElement;
    expect(row.getAttribute("data-lab3-day-density")).toBe("art");
    expect(row.style.height).toBe(`${LAB3_ART_DAY_PX}px`);
    expect(screen.getByText("Long scheduled title that should stay readable")).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/thumb/post_1.webp");
  });

  it("uses a medium text treatment when art cannot be resolved", () => {
    render(
      <Lab3ScheduleDayRow
        day={9}
        events={[event({ post_id: "missing" })]}
        isToday={false}
        isPast={false}
        isPulsing={false}
        timeZone="UTC"
        artworkByPostId={new Map([["missing", null]])}
        highlightIds={new Set()}
        popSliceId={null}
        onOpenEvent={vi.fn()}
        onOpenOverflow={vi.fn()}
      />
    );
    const row = document.querySelector("[data-lab3-day-row]") as HTMLElement;
    expect(row.getAttribute("data-lab3-day-density")).toBe("text");
    expect(row.style.height).toBe(`${LAB3_TEXT_DAY_PX}px`);
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows a count for multiple events", () => {
    render(
      <Lab3ScheduleDayRow
        day={10}
        events={[event(), event({ id: "ev_2", title: "Second" })]}
        isToday={false}
        isPast={false}
        isPulsing={false}
        timeZone="UTC"
        artworkByPostId={new Map([["post_1", "/thumb/post_1.webp"]])}
        highlightIds={new Set()}
        popSliceId={null}
        onOpenEvent={vi.fn()}
        onOpenOverflow={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "+1" })).toBeTruthy();
  });
});

describe("Lab 3 event artwork resolution", () => {
  it("prefers already loaded gallery items", () => {
    const items = [
      {
        post_id: "post_1",
        media_id: "m1",
        title: "Cover",
        visibility: "public",
        published_at: "2026-07-01T00:00:00.000Z",
        tier_ids: [],
        mime_type: "image/png",
        thumb_url_path: "/api/v1/export/media/c/m1/thumb",
        content_url_path: "/api/v1/export/media/c/m1/content",
        has_renderable_media: true,
        has_export: true
      }
    ] as GalleryItem[];
    expect(artworkSrcFromGalleryItems(items, "post_1")).toMatch(/\/thumb/);
    expect(artworkSrcFromGalleryItems(items, "other")).toBeNull();
  });

  it("bounds missing post-detail fetches", async () => {
    const fetchDetail = vi.fn(async (_creator: string, postId: string) => {
      return {
        post_id: postId,
        title: postId,
        published_at: "2026-07-01T00:00:00.000Z",
        tag_ids: [],
        tiers: [],
        media: []
      } as GalleryPostDetail;
    });
    const known = new Map<string, string | null>();
    const postIds = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const next = await resolveMissingLab3Artwork({
      creatorId: "c1",
      postIds,
      known,
      fetchDetail,
      limit: 8
    });
    expect(fetchDetail).toHaveBeenCalledTimes(8);
    expect(next.size).toBe(8);
  });
});
