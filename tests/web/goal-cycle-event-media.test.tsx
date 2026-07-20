/** @vitest-environment happy-dom */

/**
 * VS8-T02 / T03 — event media bin + bounded task popover wiring.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  eventMediaIncomplete,
  eventNeedsMediaDrop,
  eventShowsMediaBin
} from "../../web/app/components/schedule-rail/EventMediaDropBin";

const root = join(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("VS8-T02 event media helpers", () => {
  it("armed drop only when needs_media is true", () => {
    expect(
      eventNeedsMediaDrop({
        action: "post",
        status: "pending",
        needs_media: true
      })
    ).toBe(true);
    expect(
      eventNeedsMediaDrop({
        action: "post",
        status: "pending",
        needs_media: false
      })
    ).toBe(false);
  });

  it("popover media bin allows replace on attached publish posts", () => {
    expect(
      eventShowsMediaBin({
        action: "post",
        status: "pending"
      })
    ).toBe(true);
    expect(
      eventShowsMediaBin({
        action: "post",
        status: "pending",
        task_kind: "social_upkeep"
      })
    ).toBe(false);
    expect(
      eventShowsMediaBin({
        action: "repost",
        status: "pending"
      })
    ).toBe(false);
  });

  it("media incomplete follows needs_media / media_state / readiness_errors", () => {
    expect(eventMediaIncomplete({ needs_media: true })).toBe(true);
    expect(eventMediaIncomplete({ media_state: "ready" })).toBe(false);
    expect(eventMediaIncomplete({ readiness_errors: ["attach_media"] })).toBe(true);
  });

  it("wires replace/remove modes through Studio rail host", () => {
    const studio = readSrc("web/app/components/schedule-rail/StudioScheduleRail.tsx");
    expect(studio).toMatch(/mode:\s*"replace"/);
    expect(studio).toMatch(/mode:\s*"remove"/);
    expect(studio).toMatch(/onEventMediaClear/);
  });

  it("popover routes publish confirmation without autonomous publish", () => {
    const popover = readSrc("web/app/components/schedule-rail/EventPopover.tsx");
    expect(popover).toMatch(/Confirm publish in Studio/);
    expect(popover).toMatch(/never publishes/);
    expect(popover).toMatch(/Mark upkeep done|Mark rest done/);
    expect(popover).not.toMatch(/clickPublish|auto.?publish/i);
  });
});
