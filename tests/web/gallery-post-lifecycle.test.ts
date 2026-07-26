import { describe, expect, it } from "vitest";
import { galleryPostLifecycleStatus } from "@/lib/active-post-presence";

describe("galleryPostLifecycleStatus", () => {
  it("maps present destinations to live", () => {
    expect(
      galleryPostLifecycleStatus({
        published_at: "2026-07-01T00:00:00.000Z",
        visibility: "visible",
        distribution_summary: {
          destinations: [
            {
              destination: "patreon",
              attempt_status: "posted",
              external_url: "https://patreon.com/x"
            }
          ]
        }
      })
    ).toBe("live");
  });

  it("maps scheduled attempt statuses", () => {
    expect(
      galleryPostLifecycleStatus({
        published_at: "",
        visibility: "visible",
        distribution_summary: {
          destinations: [{ destination: "x", attempt_status: "scheduled" }]
        }
      })
    ).toBe("scheduled");
  });

  it("maps hidden / review / unpublished to draft", () => {
    expect(
      galleryPostLifecycleStatus({
        published_at: "",
        visibility: "hidden",
        distribution_summary: null
      })
    ).toBe("draft");
  });
});
