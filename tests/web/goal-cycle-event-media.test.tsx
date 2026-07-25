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

  it("offers Post now for authored + media-ready events via scheduled-post review", () => {
    const popover = readSrc("web/app/components/schedule-rail/EventPopover.tsx");
    expect(popover).toMatch(/data-testid="event-post-now"/);
    expect(popover).toMatch(/Post now/);
    expect(popover).toMatch(/\/studio\/distribution\?event_id=/);
    expect(popover).toMatch(/post_details_state === "authored"/);
    expect(popover).toMatch(/Post now instead of waiting/);
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
    expect(details).toMatch(/saved-line-chips/);
    expect(details).toMatch(/Patreon CTA/);
    expect(details).toMatch(/Comms Open/);
    expect(details).toMatch(/Custom/);
    expect(details).toMatch(/custom-saved-line-modal/);
    expect(details).toMatch(/buildPatreonHomepageUrl|fetchPatreonSyncState/);
    expect(details).toMatch(/Save post details/);
    expect(details).toMatch(/fetchPostTemplates|createPostTemplate/);
    expect(details).not.toMatch(/How to use your words/);
    expect(details).not.toMatch(/Use as written/);
    expect(details).not.toMatch(/Fit to each platform/);
    expect(details).not.toMatch(/Prepare platform versions/);
    expect(details).not.toMatch(/Use original/);
    expect(details).not.toMatch(/fit_mode/);
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

  it("wires scheduled-post review route without minting a second post", () => {
    const page = readSrc("web/app/studio/distribution/page.tsx");
    const client = readSrc("web/app/studio/distribution/scheduled-post-review-client.tsx");
    const confirm = readSrc("web/app/studio/distribution/scheduled-relay-post-confirm.tsx");
    const steps = readSrc("web/app/components/distribution/AutopostDistributionSteps.tsx");
    const transformer = readSrc("web/app/components/distribution/TransformerNodePage.tsx");
    const autopost = readSrc("web/app/studio/autopost/autopost-page-client.tsx");
    const api = readSrc("web/lib/schedule-rail-api.ts");
    const server = readSrc("src/server.ts");
    const publishSvc = readSrc("src/relay/publish-existing-relay-post.ts");
    const draftSvc = readSrc("src/autopost/autopost-draft-service.ts");

    expect(page).toMatch(/ScheduledPostReviewClient/);
    expect(client).toMatch(/fetchScheduleRailReview/);
    expect(client).toMatch(/scheduled-post-core-review/);
    expect(client).toMatch(/scheduled-post-autopost-review/);
    expect(client).toMatch(/scheduled-post-recovery/);
    expect(client).toMatch(/scheduled-relay-post-confirm|ScheduledRelayPostConfirm/);
    expect(client).toMatch(/publish_state/);
    expect(client).toMatch(/preserveScheduledPlan/);
    expect(client).toMatch(/exportMediaContentUrl/);
    expect(client).toMatch(/mediaItems=\{mediaItems\}/);
    expect(client).toMatch(/requireExplicitPrepare/);
    expect(client).not.toMatch(/publishAutopostDraft/);
    expect(client).toMatch(/publishScheduleRailReview|ScheduledRelayPostConfirm/);
    expect(confirm).toMatch(/Publish to Relay and continue/);
    expect(confirm).toMatch(/publishScheduleRailReview/);
    expect(confirm).toMatch(/Ready to publish/);
    expect(confirm).toMatch(/aspect-video/);
    expect(confirm).toMatch(/rounded-full/);
    expect(confirm).toMatch(/2D6A4F/);
    expect(api).toMatch(/publishScheduleRailReview/);
    expect(server).toMatch(/schedule-rail\/review\/:event_id\/publish/);
    expect(publishSvc).toMatch(/publishExistingRelayPost/);
    expect(draftSvc).toMatch(/rail_linked_post/);
    expect(steps).toMatch(/reviseScheduledPostDistributionPlan/);
    expect(steps).toMatch(/preserveScheduledPlan/);
    expect(steps).toMatch(/requireExplicitPrepare/);
    expect(transformer).toMatch(/rail_scheduled_revision/);
    expect(transformer).toMatch(/rail_prepared/);
    expect(transformer).toMatch(/ScheduledPostPreparePanel/);
    expect(transformer).toMatch(/requireExplicitPrepare/);
    const preparePanel = readSrc("web/app/components/distribution/ScheduledPostPreparePanel.tsx");
    expect(preparePanel).toMatch(/scheduled-post-prepare-panel/);
    expect(preparePanel).toMatch(/routeLabel/);
    expect(preparePanel).toMatch(/Generate a Preview/);
    expect(autopost).toMatch(/linked_post_id/);
    expect(autopost).toMatch(/studio\/distribution\?draft_id=/);
  });
});
