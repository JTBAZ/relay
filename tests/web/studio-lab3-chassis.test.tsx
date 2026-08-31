/** @vitest-environment happy-dom */

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldShowStudioNav } from "@/app/components/ConditionalAppNav";
import { Lab3TopBar } from "@/app/components/studio-lab3/Lab3TopBar";
import { Lab3CollectionsShelf } from "@/app/components/studio-lab3/Lab3CollectionsShelf";
import { Lab3GalleryToolbar } from "@/app/components/studio-lab3/Lab3GalleryToolbar";
import { Lab3FilterSheet } from "@/app/components/studio-lab3/Lab3FilterSheet";
import StudioLab3PageClient from "@/app/studio/lab3/lab3-page-client";
import { lab3RailShouldOpen, newestCollectionId } from "@/lib/lab3-command-apply";
import type { Collection, GalleryItem } from "@/lib/relay-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/studio/lab3",
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/studio-session-context", () => ({
  useStudioSession: () => ({
    ready: true,
    hasRelaySession: true,
    activeRole: "creator",
    storedRelayCreatorId: "test_creator",
    creatorId: "test_creator"
  }),
  StudioSessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock("@/app/components/studio/StudioRouteGuard", () => ({
  StudioRouteGuard: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock("@/app/components/goals-lab/GoalsLabContext", () => ({
  GoalsLabProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock("@/app/studio/GalleryView", () => ({
  __esModule: true,
  default: ({ floorspace }: { floorspace?: string }) => (
    <div data-testid="gallery-view" data-floorspace={floorspace ?? "classic"} />
  )
}));

afterEach(() => {
  cleanup();
});

describe("Lab 3 chassis isolation", () => {
  it("hides global Studio nav on /studio/lab3 and keeps Lab 1 hidden separately", () => {
    expect(shouldShowStudioNav("/studio/lab3")).toBe(false);
    expect(shouldShowStudioNav("/studio/lab3/extra")).toBe(false);
    expect(shouldShowStudioNav("/studio/lab")).toBe(false);
    expect(shouldShowStudioNav("/studio/lab2")).toBe(false);
    expect(shouldShowStudioNav("/studio")).toBe(true);
  });

  it("mounts Lab 3 top bar without Goals, Automations, or Autopost", () => {
    render(<Lab3TopBar />);
    expect(screen.getByText("Lab 3")).toBeTruthy();
    expect(screen.getByText("Relay")).toBeTruthy();
    expect(screen.queryByText("Goals")).toBeNull();
    expect(screen.queryByText("Automations")).toBeNull();
    expect(screen.queryByText("Autopost")).toBeNull();
    expect(screen.queryByText("Crossposter")).toBeNull();
    expect(screen.queryByText("Patreon Health")).toBeNull();
    expect(screen.queryByText("Distribution")).toBeNull();
  });

  it("wires the Lab 3 route to GalleryView floorspace=lab3", () => {
    render(<StudioLab3PageClient />);
    expect(document.querySelector("[data-lab3-chassis]")).toBeTruthy();
    expect(document.querySelector("[data-lab3-chassis]")?.className).toContain("studio-lab3");
    expect(document.querySelector("[data-lab3-top-bar]")).toBeTruthy();
    expect(screen.getByTestId("gallery-view").getAttribute("data-floorspace")).toBe("lab3");
  });

  it("opens the schedule rail only for schedule command hints", () => {
    expect(lab3RailShouldOpen("schedule")).toBe(true);
    expect(lab3RailShouldOpen("collections")).toBe(false);
    expect(lab3RailShouldOpen(null)).toBe(false);
  });

  it("spotlights the newest collection after a collections command", () => {
    const items = [
      {
        collection_id: "col_old",
        updated_at: "2026-01-01T00:00:00.000Z"
      },
      {
        collection_id: "col_new",
        updated_at: "2026-08-01T00:00:00.000Z"
      }
    ] as Collection[];
    expect(newestCollectionId(items)).toBe("col_new");
    expect(newestCollectionId([])).toBeNull();
  });

  it("renders a compact collections shelf and omits empty reserved space", () => {
    const { rerender } = render(
      <Lab3CollectionsShelf collections={[]} items={[]} activeCollectionId={null} onSelect={vi.fn()} />
    );
    expect(document.querySelector("[data-lab3-collections-shelf]")).toBeNull();
    rerender(
      <Lab3CollectionsShelf
        collections={[
          {
            collection_id: "col_1",
            creator_id: "c",
            title: "Photo Studies",
            theme_tag_ids: [],
            post_ids: ["post_1"],
            sort_order: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z"
          }
        ]}
        items={
          [
            {
              post_id: "post_1",
              title: "Intro",
              thumb_url_path: "/api/v1/export/media/c/post_1/thumb",
              mime_type: "image/png",
              has_export: true,
              has_renderable_media: true
            }
          ] as GalleryItem[]
        }
        activeCollectionId="col_1"
        onSelect={vi.fn()}
      />
    );
    const shelf = document.querySelector("[data-lab3-collections-shelf]") as HTMLElement;
    expect(shelf).toBeTruthy();
    expect(shelf.hasAttribute("data-lab3-shelf-compact")).toBe(true);
    expect(shelf.className).toContain("h-[72px]");
    expect(screen.getByText("Photo Studies")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Photo Studies/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("keeps toolbar actions grouped and exposes a mobile Schedule control", () => {
    render(
      <Lab3GalleryToolbar
        postCount={12}
        activeCollectionId={null}
        q=""
        onSetQ={vi.fn()}
        onClearCollection={vi.fn()}
        onOpenFilters={vi.fn()}
        onAddWork={vi.fn()}
        onOpenSchedule={vi.fn()}
      />
    );
    expect(screen.getByText("All work")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    const primary = document.querySelector("[data-lab3-toolbar-primary]");
    expect(primary?.textContent).toMatch(/All work/);
    expect(primary?.textContent).toMatch(/Import/);
    const tools = document.querySelector("[data-lab3-toolbar-tools]");
    expect(tools?.querySelector('[aria-label="Search library"]')).toBeTruthy();
    expect(tools?.textContent).toMatch(/Filters/);
    expect(tools?.textContent).not.toMatch(/Import/);
    expect(screen.getByRole("button", { name: /Import/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Import/ }).className).toContain("rounded-lg");
    expect(screen.queryByRole("button", { name: /Add work/ })).toBeNull();
    expect(document.querySelector("[data-lab3-toolbar-schedule]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open schedule" }).className).toContain("lg:hidden");
  });

  it("presents filters in a Lab 3 sheet and restores focus on close", () => {
    const onClose = vi.fn();
    const restore = { current: document.createElement("button") };
    restore.current.setAttribute("aria-label", "Filters");
    document.body.appendChild(restore.current);
    restore.current.focus();
    const { rerender } = render(
      <Lab3FilterSheet open onClose={onClose} restoreFocusRef={restore}>
        <p>Access</p>
      </Lab3FilterSheet>
    );
    expect(document.querySelector("[data-lab3-filter-sheet]")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Filters" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close Filters" }));
    rerender(
      <Lab3FilterSheet open={false} onClose={onClose} restoreFocusRef={restore}>
        <p>Access</p>
      </Lab3FilterSheet>
    );
    expect(document.activeElement).toBe(restore.current);
    restore.current.remove();
  });

  it("keeps closed filter sheets out of the accessibility tree", () => {
    render(
      <Lab3FilterSheet open={false} onClose={vi.fn()}>
        <p>Access</p>
      </Lab3FilterSheet>
    );
    expect(document.querySelector("[data-lab3-filter-sheet]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
