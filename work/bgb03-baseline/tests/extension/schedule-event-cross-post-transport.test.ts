import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getGrant: vi.fn(), clearGrant: vi.fn(), clearPendingCrossPost: vi.fn(), setPendingCrossPost: vi.fn(),
}));
vi.mock("../../extension/src/lib/storage", () => storage);

import { fetchAndStoreCrossPostPackageFromMessage } from "../../extension/src/lib/cross-post-fetch";
import { isExternalCrossPostMessage } from "../../extension/src/lib/cross-post-types";

const eventId = `bench_event_${"b".repeat(64)}`;
const message = { type: "RELAY_CROSS_POST", schedule_event_id: eventId, destination: "x" } as const;
const packageData = {
  relay_post_id: "library-post-1", title: "Saved title", body_text: "", post_text: "Saved title",
  media: [{ media_id: "media-1", filename: "media-1.jpg", mime_type: "image/jpeg", content_url: "/api/v1/export/media/creator-1/media-1/content" }]
};

describe("schedule-event extension handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getGrant.mockResolvedValue({ token: "extension-token" });
    storage.clearPendingCrossPost.mockResolvedValue(undefined);
    storage.setPendingCrossPost.mockResolvedValue(undefined);
    storage.clearGrant.mockResolvedValue(undefined);
  });

  it("accepts only the strict X schedule-event message branch", () => {
    expect(isExternalCrossPostMessage(message)).toBe(true);
    expect(isExternalCrossPostMessage({ ...message, relay_post_id: "legacy-post" })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message, distribution_attempt_id: "attempt-1" })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message, content_override: { post_text: "override" } })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message, destination: "patreon" })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message, destination: undefined })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message, schedule_event_id: "not-an-event-id" })).toBe(false);
    expect(isExternalCrossPostMessage({ type: "RELAY_CROSS_POST", relay_post_id: "legacy-post" })).toBe(true);
  });

  it("checks the API event identity and X destination before storing without an attempt ID", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {
      schedule_event_id: eventId, destination: "x", package: packageData
    } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/extension/cross-post/schedule-events/${eventId}`), expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ Authorization: "Bearer extension-token" })
    }));
    expect(result).toEqual({ ok: true, schedule_event_id: eventId, relay_post_id: "library-post-1", destination: "x" });
    expect(storage.setPendingCrossPost).toHaveBeenCalledWith(expect.objectContaining({ relay_post_id: "library-post-1", media: packageData.media }));
    expect(storage.setPendingCrossPost).toHaveBeenCalledTimes(1);
    expect(storage.setPendingCrossPost.mock.calls[0]).toHaveLength(1);
    expect(storage.clearPendingCrossPost).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a different event", { schedule_event_id: `bench_event_${"c".repeat(64)}`, destination: "x", package: packageData }],
    ["a different destination", { schedule_event_id: eventId, destination: "patreon", package: packageData }],
  ])("does not store when the API returns %s", async (_name, data) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })));
    await expect(fetchAndStoreCrossPostPackageFromMessage(message)).resolves.toMatchObject({ ok: false, reason: "package_fetch_failed" });
    expect(storage.setPendingCrossPost).not.toHaveBeenCalled();
  });
});
