/** @vitest-environment happy-dom */

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "@/lib/relay-api";
import type { PostGalleryGroup } from "@/lib/gallery-group";

const relayFetchWithoutAuthRedirect = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    prefetch: vi.fn()
  }),
  usePathname: () => "/studio/lab2",
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

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-api")>();
  return {
    ...actual,
    relayFetchWithoutAuthRedirect: (...args: unknown[]) =>
      relayFetchWithoutAuthRedirect(...args),
    syncHealthBlocksStudioWrites: () => false,
    createPostDistributionPlan: vi.fn().mockResolvedValue(undefined),
    linkCreativeWorkPosts: vi.fn().mockResolvedValue(undefined),
    relayNativeDeletePost: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("@/lib/relay-distribution-refresh", () => ({
  subscribeRelayDistributionRefresh: () => () => {}
}));

vi.mock("@/app/components/GalleryGrid", () => ({
  __esModule: true,
  default: ({
    groups,
    gridDensity
  }: {
    groups: PostGalleryGroup[];
    gridDensity?: string;
  }) => (
    <div role="list" data-grid-density={gridDensity ?? "dense"}>
      {groups.map((group) => {
        const title = group.items[0]?.title ?? group.post_id;
        return (
          <div key={group.post_id} data-gallery-tile role="listitem">
            {title}
          </div>
        );
      })}
    </div>
  ),
  galleryGridColumnCount: () => 3
}));

vi.mock("@/app/components/distribution/DistributionSheet", () => ({
  DistributionSheet: () => null
}));

vi.mock("@/app/components/studio/HeroInspectOverlay", () => ({
  __esModule: true,
  default: () => null,
  galleryItemsToHeroMediaStrip: () => []
}));

vi.mock("@/app/components/studio/LinkedSetDrilldown", () => ({
  __esModule: true,
  default: () => null
}));

vi.mock("@/app/components/studio/LinkConfirmSheet", () => ({
  __esModule: true,
  default: () => null
}));

vi.mock("@/app/components/BulkActionBar", () => ({
  __esModule: true,
  default: () => null
}));

vi.mock("@/app/components/schedule-rail/StudioScheduleRail", () => ({
  __esModule: true,
  default: ({
    onCommitMedia,
    dropPresentation,
    corridorArmed
  }: {
    onCommitMedia?: (ids: string[]) => void;
    dropPresentation?: string;
    corridorArmed?: boolean;
  }) => (
    <div
      aria-label="Scheduler"
      data-drop-presentation={dropPresentation}
      data-corridor-armed={corridorArmed ? "true" : undefined}
    >
      <div data-lab2-intake-band data-armed={corridorArmed ? "true" : undefined}>
        <span>{corridorArmed ? "Release to schedule" : "Drop media here"}</span>
      </div>
      <span>Scheduler</span>
      <button type="button" onClick={() => onCommitMedia?.(["media_rail_1"])}>
        Commit rail media
      </button>
    </div>
  )
}));

vi.mock("@/app/components/studio/LabStagingDock", () => ({
  LabStagingDock: ({
    onAutopost,
    variant,
    onCorridorDragChange
  }: {
    onAutopost?: (items: Array<{ id: string; serverStaged?: boolean }>) => void;
    variant?: string;
    onCorridorDragChange?: (dragging: boolean) => void;
  }) => (
    <div data-lab-staging-dock data-import-bay data-variant={variant ?? "default"}>
      <span>Import Bay</span>
      <span>drag to schedule →</span>
      <button type="button" aria-label="Add files">
        +
      </button>
      <button
        type="button"
        aria-label="Simulate bay drag"
        onClick={() => onCorridorDragChange?.(true)}
      >
        Start drag
      </button>
      <button
        type="button"
        aria-label="End bay drag"
        onClick={() => onCorridorDragChange?.(false)}
      >
        End drag
      </button>
      <button
        type="button"
        onClick={() =>
          onAutopost?.([{ id: "media_staged_1", serverStaged: true }])
        }
      >
        Autopost staged
      </button>
    </div>
  )
}));

vi.mock("@/app/components/goals-lab/GoalsLabLauncher", () => ({
  GoalsLabLauncher: () => (
    <button type="button" aria-label="Open Goals">
      Goals
    </button>
  )
}));

vi.mock("@/app/components/PatreonSyncMenu", () => ({
  __esModule: true,
  default: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel ?? "Patreon"}</button>
  )
}));

import StudioLab2Chassis from "@/app/components/studio-lab2/StudioLab2Chassis";
import { GoalsLabProvider } from "@/app/components/goals-lab/GoalsLabContext";

function galleryItem(
  overrides: Partial<GalleryItem> & Pick<GalleryItem, "media_id" | "post_id" | "title">
): GalleryItem {
  return {
    description: "",
    published_at: "2026-07-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/content",
    preview_url_path: "/preview",
    thumb_url_path: "/thumb",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

const LIVE_POST = galleryItem({
  media_id: "m_live",
  post_id: "p_live",
  title: "Character drop",
  published_at: "2026-07-01T00:00:00.000Z",
  visibility: "visible",
  distribution_summary: {
    post_id: "p_live",
    destinations: [
      {
        destination: "patreon",
        variant_status: null,
        attempt_status: "posted",
        attempt_id: null,
        external_url: "https://patreon.com/posts/1",
        external_id: null
      }
    ]
  }
});

const DRAFT_POST = galleryItem({
  media_id: "m_draft",
  post_id: "p_draft",
  title: "Patreon process note",
  published_at: "",
  visibility: "hidden",
  distribution_summary: undefined
});

function mockGalleryPayload(items: GalleryItem[]) {
  relayFetchWithoutAuthRedirect.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("/gallery/facets")) {
      return {
        tag_ids: [],
        tier_ids: [],
        tiers: [],
        tag_counts: {},
        export_total_bytes: 0,
        export_media_count: 0
      };
    }
    if (typeof path === "string" && path.includes("/gallery/collections")) {
      return { collections: [] };
    }
    if (typeof path === "string" && path.includes("/patreon/sync-state")) {
      return {};
    }
    return { items, next_cursor: null };
  });
}

function renderChassis() {
  return render(
    <GoalsLabProvider>
      <StudioLab2Chassis />
    </GoalsLabProvider>
  );
}

describe("StudioLab2Chassis (Phase 3 live bay + rail + nav)", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    push.mockReset();
    mockGalleryPayload([LIVE_POST, DRAFT_POST]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    relayFetchWithoutAuthRedirect.mockReset();
  });

  it("renders live shell regions and nav destinations", async () => {
    renderChassis();

    expect(screen.getByText("Relay")).toBeTruthy();
    expect(screen.getByText("/ Studio")).toBeTruthy();
    expect(screen.getByText("Import Bay")).toBeTruthy();
    expect(screen.getByText("drag to schedule →")).toBeTruthy();
    expect(screen.getByLabelText("Add files")).toBeTruthy();
    expect(document.querySelector("[data-import-bay]")?.getAttribute("data-variant")).toBe(
      "studio"
    );
    expect(screen.getByText("Active Posts")).toBeTruthy();
    expect(screen.getByLabelText("Scheduler")).toBeTruthy();
    expect(screen.getByText("Drop media here")).toBeTruthy();
    expect(screen.getByLabelText("Scheduler").getAttribute("data-drop-presentation")).toBe(
      "ritual"
    );
    expect(screen.getByRole("navigation", { name: "Studio tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Goals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Automations" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crossposter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Patreon Health" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Autopost/i })).toBeNull();
    expect(screen.getByLabelText("Search posts")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^More$/i })).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("Character drop")).toBeTruthy();
    });
    expect(screen.getByRole("list").getAttribute("data-grid-density")).toBe("lab2");
    expect(screen.getByLabelText("Scheduler").getAttribute("data-drop-presentation")).toBe(
      "ritual"
    );
  });

  it("routes Automations and Crossposter nav destinations", () => {
    renderChassis();

    fireEvent.click(screen.getByRole("button", { name: "Automations" }));
    expect(push).toHaveBeenCalledWith("/studio/lab2?automations=1");

    fireEvent.click(screen.getByRole("button", { name: "Crossposter" }));
    expect(push).toHaveBeenCalledWith("/studio/autopost");
  });

  it("hands Import Bay and rail media commits to Autopost", () => {
    renderChassis();

    fireEvent.click(screen.getByRole("button", { name: "Autopost staged" }));
    expect(push).toHaveBeenCalledWith(
      "/studio/autopost?media_ids=media_staged_1"
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit rail media" }));
    expect(push).toHaveBeenCalledWith(
      "/studio/autopost?media_ids=media_rail_1&stage=platforms"
    );
  });

  it("arms Scheduler intake when Import Bay drag starts", () => {
    renderChassis();

    expect(screen.getByText("Drop media here")).toBeTruthy();
    expect(
      screen.getByLabelText("Scheduler").getAttribute("data-corridor-armed")
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Simulate bay drag" }));
    expect(screen.getByText("Release to schedule")).toBeTruthy();
    expect(
      screen.getByLabelText("Scheduler").getAttribute("data-corridor-armed")
    ).toBe("true");
    expect(document.querySelector("[data-bay-dragging]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "End bay drag" }));
    expect(screen.getByText("Drop media here")).toBeTruthy();
    expect(
      screen.getByLabelText("Scheduler").getAttribute("data-corridor-armed")
    ).toBeNull();
  });
});
