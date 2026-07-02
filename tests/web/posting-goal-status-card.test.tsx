/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorPostingGoalStatus = vi.fn();
const snoozeCurrentCreatorPostingGoalNudge = vi.fn();
const skipCurrentCreatorPostingGoalNudge = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    fetchCreatorPostingGoalStatus: (...args: unknown[]) =>
      fetchCreatorPostingGoalStatus(...args),
    snoozeCurrentCreatorPostingGoalNudge: (...args: unknown[]) =>
      snoozeCurrentCreatorPostingGoalNudge(...args),
    skipCurrentCreatorPostingGoalNudge: (...args: unknown[]) =>
      skipCurrentCreatorPostingGoalNudge(...args),
    RelayApiError: StubRelayApiError,
  };
});

vi.mock("@/lib/studio-session-context", () => ({
  useStudioSession: () => ({ creatorId: "cr1" }),
}));

vi.mock("../../web/app/components/studio/PostingGoalUploadModal", () => ({
  default: ({
    open,
    onClose,
    onUploaded,
  }: {
    open: boolean;
    onClose: () => void;
    onUploaded?: (count: number) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Upload media to your bin">
        <button type="button" onClick={onClose}>
          Close upload modal
        </button>
        <button type="button" onClick={() => onUploaded?.(1)}>
          Complete mock upload
        </button>
      </div>
    ) : null,
}));

import PostingGoalStatusCard from "../../web/app/components/studio/PostingGoalStatusCard";

const behindWithMedia = {
  goal: {
    monthly_post_target: 1,
    bonus_nudges_enabled: false,
    timezone: "UTC",
    enabled: true,
  },
  period: { key: "2026-06", start: "2026-06-01T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" },
  posts_this_month: 0,
  remaining: 1,
  staged_media_count: 2,
  pace_status: "behind" as const,
  active_nudge: null,
};

const skippedStatus = {
  ...behindWithMedia,
  active_nudge: {
    nudge_id: "n1",
    nudge_type: "posting_goal" as const,
    status: "skipped" as const,
    snoozed_until: null,
  },
};

describe("<PostingGoalStatusCard />", () => {
  beforeEach(() => {
    fetchCreatorPostingGoalStatus.mockReset();
    snoozeCurrentCreatorPostingGoalNudge.mockReset();
    skipCurrentCreatorPostingGoalNudge.mockReset();
    fetchCreatorPostingGoalStatus.mockResolvedValue({ status: behindWithMedia });
    snoozeCurrentCreatorPostingGoalNudge.mockResolvedValue({
      nudge: { nudge_id: "n1", status: "snoozed" },
    });
    skipCurrentCreatorPostingGoalNudge.mockResolvedValue({
      nudge: { nudge_id: "n1", status: "skipped" },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows behind copy with autopost and dismiss actions", async () => {
    render(<PostingGoalStatusCard />);
    await waitFor(() => expect(fetchCreatorPostingGoalStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/turn something from your bin/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /start autopost/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^snooze$/i })).toBeTruthy();
  });

  it("hides after skip without reloading the page", async () => {
    fetchCreatorPostingGoalStatus
      .mockResolvedValueOnce({ status: behindWithMedia })
      .mockResolvedValueOnce({ status: skippedStatus });
    render(<PostingGoalStatusCard />);
    await waitFor(() => expect(screen.getByRole("button", { name: /skip this month/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /skip this month/i }));
    await waitFor(() => expect(skipCurrentCreatorPostingGoalNudge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchCreatorPostingGoalStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/turn something from your bin/i)).toBeNull();
  });

  it("calls upload handler for empty-bin state", async () => {
    fetchCreatorPostingGoalStatus.mockResolvedValue({
      status: { ...behindWithMedia, staged_media_count: 0 },
    });
    render(<PostingGoalStatusCard />);
    await waitFor(() => expect(screen.getByRole("button", { name: /upload media/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /upload media/i }));
    expect(screen.getByRole("dialog", { name: /upload media to your bin/i })).toBeTruthy();
  });

  it("refetches status after modal upload completes", async () => {
    fetchCreatorPostingGoalStatus
      .mockResolvedValueOnce({
        status: { ...behindWithMedia, staged_media_count: 0 },
      })
      .mockResolvedValueOnce({
        status: { ...behindWithMedia, staged_media_count: 1, pace_status: "behind" as const },
      });
    render(<PostingGoalStatusCard />);
    await waitFor(() => expect(screen.getByRole("button", { name: /upload media/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /upload media/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete mock upload/i }));
    await waitFor(() => expect(fetchCreatorPostingGoalStatus).toHaveBeenCalledTimes(2));
  });
});
