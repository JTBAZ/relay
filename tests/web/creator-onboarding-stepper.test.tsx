/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreatorOnboardingStepper from "../../web/app/components/studio/CreatorOnboardingStepper";

vi.mock("@/lib/relay-api", () => ({
  CREATOR_ONBOARDING_STEP_ORDER: ["connected", "import_started", "organized", "published"],
  describeSyncHealthPublishBlock: vi.fn((syncHealth) => {
    if (syncHealth?.status === "failed") {
      return "Patreon sync failed — open the sync menu in Library and fix import health before publishing.";
    }
    if (syncHealth?.status === "degraded") {
      return "Patreon sync is degraded — resolve sync warnings in Library before publishing.";
    }
    return null;
  }),
  fetchCreatorOnboarding: vi.fn(),
  patchCreatorOnboarding: vi.fn()
}));

import { fetchCreatorOnboarding } from "@/lib/relay-api";

const healthySync = {
  status: "healthy" as const,
  last_success_at: "2026-05-21T11:30:00.000Z",
  last_error: null,
  campaign_id: "camp_1",
  message_key: "sync_health.healthy"
};

describe("CreatorOnboardingStepper PILOT-009", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows import progress hint after a successful scrape", async () => {
    vi.mocked(fetchCreatorOnboarding).mockResolvedValue({
      creator_id: "cr_ava",
      step: "import_started",
      metadata: null,
      updated_at: "2026-05-21T12:00:00.000Z",
      import_progress: {
        last_post_scrape_finished_at: "2026-05-21T11:30:00.000Z",
        last_post_scrape_ok: true,
        last_post_scrape_posts_written: 12
      },
      sync_health: healthySync
    });

    render(<CreatorOnboardingStepper creatorId="cr_ava" />);

    expect(await screen.findByText(/Wrote 12 post\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Last sync/i)).toBeTruthy();
  });

  it("shows publish CTA at organized step", async () => {
    vi.mocked(fetchCreatorOnboarding).mockResolvedValue({
      creator_id: "cr_ava",
      step: "organized",
      metadata: null,
      updated_at: "2026-05-21T12:00:00.000Z",
      import_progress: null,
      sync_health: healthySync
    });

    render(<CreatorOnboardingStepper creatorId="cr_ava" />);

    const btn = await screen.findByRole("button", { name: /mark ready to publish/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables publish CTA when sync_health is failed", async () => {
    vi.mocked(fetchCreatorOnboarding).mockResolvedValue({
      creator_id: "cr_ava",
      step: "organized",
      metadata: null,
      updated_at: "2026-05-21T12:00:00.000Z",
      import_progress: null,
      sync_health: {
        status: "failed",
        last_success_at: null,
        last_error: null,
        campaign_id: "camp_1",
        message_key: "sync_health.post_scrape_failed"
      }
    });

    render(<CreatorOnboardingStepper creatorId="cr_ava" />);

    const btn = await screen.findByRole("button", { name: /mark ready to publish/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/sync failed/i)).toBeTruthy();
  });
});
