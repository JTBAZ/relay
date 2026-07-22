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
    // Attach must not silently skip non-postbot rail rows (routine slots / manual posts).
    expect(studio).not.toMatch(/if\s*\(\s*event\.source\s*===\s*"manual_event"\s*\)\s*return/);
    expect(studio).toMatch(/resolveAttachRailId/);
  });

  it("popover omits completion Done, publish confirm, notify, and Autopost handoff", () => {
    const popover = readSrc("web/app/components/schedule-rail/EventPopover.tsx");
    expect(popover).not.toMatch(/Confirm publish in Studio/);
    expect(popover).not.toMatch(/never publishes/);
    expect(popover).not.toMatch(/Notify me/);
    expect(popover).not.toMatch(/onNotifyToggle/);
    expect(popover).not.toMatch(/onDone/);
    expect(popover).not.toMatch(/Mark upkeep done|Mark rest done/);
    expect(popover).not.toMatch(/Mark each destination Done/);
    expect(popover).not.toMatch(/Open in Autopost|Continue in Autopost/);
    expect(popover).not.toMatch(/\/studio\/autopost\?draft_id/);
    expect(popover).not.toMatch(/clickPublish|auto.?publish/i);
  });

  it("mounted media is a hero thumb with Import Bay return (not permanent delete)", () => {
    const popover = readSrc("web/app/components/schedule-rail/EventPopover.tsx");
    expect(popover).toMatch(/data-event-media-hero/);
    expect(popover).toMatch(/Return media to Import Bay/);
    expect(popover).toMatch(/Trash2/);
    expect(popover).not.toMatch(/Media attached — drop to replace/);
    expect(popover).not.toMatch(/State:\s*\{/);
    const studio = readSrc("web/app/components/schedule-rail/StudioScheduleRail.tsx");
    expect(studio).toMatch(/requestLibraryStagingRefresh/);
  });

  it("wires post-attach receipt and enrichment panel without banned wording", () => {
    const rail = readSrc("web/app/components/schedule-rail/ScheduleRail.tsx");
    const popover = readSrc("web/app/components/schedule-rail/EventPopover.tsx");
    const details = readSrc("web/app/components/schedule-rail/EventPostDetails.tsx");
    const receipt = readSrc("web/app/components/schedule-rail/MediaAttachReceipt.tsx");

    expect(rail).toMatch(/MediaAttachReceipt/);
    expect(rail).toMatch(/showAttachReceipt/);
    expect(rail).toMatch(/onAddPostDetails/);
    expect(popover).toMatch(/EventPostDetails/);
    expect(details).toMatch(/Add post details/);
    expect(details).toMatch(/Post details ready/);
    expect(details).toMatch(/Use as written/);
    expect(details).toMatch(/Fit to each platform/);
    expect(details).toMatch(/saved-line-chips/);
    expect(details).toMatch(/Patreon CTA/);
    expect(details).toMatch(/Comms Open/);
    expect(details).toMatch(/Custom/);
    expect(details).toMatch(/custom-saved-line-modal/);
    expect(details).toMatch(/buildPatreonHomepageUrl|fetchPatreonSyncState/);
    expect(details).toMatch(/Save post details/);
    expect(details).toMatch(/Prepare platform versions/);
    expect(details).toMatch(/fetchPostTemplates|createPostTemplate/);
    expect(details).toMatch(/Use original/);
    expect(details).toMatch(/fit_mode:\s*fitMode/);
    expect(details).not.toMatch(/Used to organize this post in Relay/);
    expect(details).not.toMatch(/Save as a saved line/);
    expect(details).not.toMatch(/Insert a phrase you use often/);
    expect(details).not.toMatch(/No saved lines yet/);
    expect(receipt).toMatch(/Media attached for/);
    expect(receipt).toMatch(/Relay will remind you/);
    expect(receipt).toMatch(/Add post details/);
    expect(receipt).toMatch(/prefers-reduced-motion/);

    for (const src of [rail, popover, details, receipt]) {
      expect(src).not.toMatch(/copy needed/i);
      expect(src).not.toMatch(/automation set/i);
    }
  });
});
