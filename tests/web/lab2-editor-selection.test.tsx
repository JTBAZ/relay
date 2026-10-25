/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GalleryItem } from "../../web/lib/relay-api";
import type { PostGalleryGroup } from "../../web/lib/gallery-group";

const fixture = vi.hoisted(() => ({ items: [] as GalleryItem[], read: vi.fn() }));
vi.mock("@/lib/relay-api", async (original) => ({
  ...await original<object>(),
  relayFetchWithoutAuthRedirect: fixture.read,
  syncHealthBlocksStudioWrites: () => true
}));
vi.mock("@/lib/studio-session-context", () => ({ useStudioSession: () => ({ creatorId: "creator" }) }));
vi.mock("@/lib/use-debounced-value", () => ({ useDebouncedValue: (value: unknown) => value }));
vi.mock("@/app/components/GalleryGrid", () => ({
  default: ({ groups, onToggleSelectGroup }: { groups: PostGalleryGroup[]; onToggleSelectGroup: (items: GalleryItem[]) => void }) => (
    <div>{groups.map((group) => <button data-gallery-tile key={group.post_id} onClick={() => onToggleSelectGroup(group.items)}>Select {group.post_id}</button>)}</div>
  )
}));
vi.mock("@/app/components/studio/LabGalleryFilterBar", () => ({
  LabGalleryFilterBar: ({ q, onSetQ }: { q: string; onSetQ: (value: string) => void }) => (
    <input aria-label="Search" value={q} onChange={(event) => onSetQ(event.target.value)} />
  )
}));
vi.mock("@/app/components/BulkActionBar", () => ({ default: () => null }));
vi.mock("@/app/components/distribution/DistributionSheet", () => ({ DistributionSheet: () => null }));
vi.mock("@/app/components/studio/LibraryEmptyState", () => ({ default: () => null }));
vi.mock("@/app/components/studio/HeroInspectOverlay", () => ({ default: () => null, galleryItemsToHeroMediaStrip: () => [] }));
vi.mock("@/app/components/studio/LinkConfirmSheet", () => ({ default: () => null }));
vi.mock("@/app/components/studio/LinkedSetDrilldown", () => ({ default: () => null }));

import Lab2ActivePostsLive, { type Lab2EditorSelection } from "../../web/app/components/studio-lab2/Lab2ActivePostsLive";

beforeEach(() => {
  fixture.items = [
    { post_id: "p1", media_id: "m1", mime_type: "image/jpeg" },
    { post_id: "p1", media_id: "m2", mime_type: "image/jpeg" },
    { post_id: "p2", media_id: "m2", mime_type: "image/jpeg" },
    { post_id: "shadow", media_id: "cover", shadow_cover: true }
  ] as GalleryItem[];
  fixture.read.mockReset().mockImplementation(async (path: string) => {
    if (path.includes("/facets")) return { tag_ids: [], tier_ids: [], tiers: [] };
    if (path.includes("/collections")) return { collections: [] };
    if (path.includes("/sync-state")) return {};
    return { items: fixture.items };
  });
});
afterEach(cleanup);

it("emits real selection, visible loaded posts, filters and write admission without a render loop", async () => {
  const changed = vi.fn<(selection: Lab2EditorSelection) => void>();
  const { rerender } = render(<Lab2ActivePostsLive onEditorContextChange={changed} />);
  await screen.findByRole("button", { name: "Select p1" });
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith({
    context: { selectedPostIds: [], selectedMediaIds: [], loadedPostIds: ["p1", "p2"], filters: { query: "", tags: "", tiers: "", mediaTypes: "" } },
    selectedItems: [], writeBlocked: true
  }));
  fireEvent.click(screen.getByRole("button", { name: "Select p1" }));
  expect(changed.mock.lastCall?.[0].selectedItems).toEqual(fixture.items.slice(0, 2));
  fireEvent.click(screen.getByRole("button", { name: "Select p2" }));
  expect(changed.mock.lastCall?.[0].context).toMatchObject({ selectedPostIds: ["p1", "p2"], selectedMediaIds: ["m1", "m2"] });
  fireEvent.click(screen.getByRole("button", { name: "Select p1" }));
  expect(changed.mock.lastCall?.[0].selectedItems).toEqual([fixture.items[2]]);
  fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "moon" } });
  await waitFor(() => expect(changed.mock.lastCall?.[0].context.filters?.query).toBe("moon"));
  const count = changed.mock.calls.length;
  rerender(<Lab2ActivePostsLive onEditorContextChange={changed} />);
  expect(changed).toHaveBeenCalledTimes(count);
  const reads = fixture.read.mock.calls.length;
  rerender(<Lab2ActivePostsLive reloadToken={1} onEditorContextChange={changed} />);
  await waitFor(() => expect(fixture.read.mock.calls.length).toBeGreaterThan(reads));
});

it("caps loaded context at the existing editor contract limit without inventing selection", async () => {
  fixture.items = Array.from({ length: 102 }, (_, i) => ({ post_id: `p${i}`, media_id: `m${i}` })) as GalleryItem[];
  const changed = vi.fn<(selection: Lab2EditorSelection) => void>();
  render(<Lab2ActivePostsLive onEditorContextChange={changed} />);
  await waitFor(() => expect(changed.mock.lastCall?.[0].context.loadedPostIds).toHaveLength(100));
  expect(changed.mock.lastCall?.[0].context.selectedPostIds).toEqual([]);
  expect(changed.mock.lastCall?.[0].selectedItems).toEqual([]);
});
