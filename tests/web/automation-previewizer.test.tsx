/**
 * AUT-VS6-T02 — plan create must not precede preview_media_id (AU-09).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAutomationPlanCreateBody } from "../../web/lib/automation-approval.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

describe("buildAutomationPlanCreateBody ordering", () => {
  it("throws when preview destinations lack preview_media_id", () => {
    expect(() =>
      buildAutomationPlanCreateBody({
        destinations: ["x", "bluesky"],
        draftId: "draft_1",
        previewMediaId: null
      })
    ).toThrow(/preview_media_id is required/);
  });

  it("includes preview_media_id after export", () => {
    const body = buildAutomationPlanCreateBody({
      destinations: ["x", "patreon"],
      draftId: "draft_1",
      previewMediaId: "media_preview_1"
    });
    expect(body.needs_preview).toBe(true);
    expect(body.preview_media_id).toBe("media_preview_1");
    expect(body.media_routing_by_destination).toEqual({
      x: "preview",
      patreon: "full"
    });
    expect(body.source_draft_id).toBe("draft_1");
  });
});

describe("approval adapter source contract", () => {
  it("creates plan only from onComplete path; materializer does not create plans", () => {
    const mat = readFileSync(
      join(repoRoot, "src/autopost/automation-materializer.ts"),
      "utf8"
    );
    expect(mat).not.toMatch(/createPostDistributionPlan/);
    const overlay = readFileSync(
      join(repoRoot, "web/app/components/automations/AutomationApprovalOverlay.tsx"),
      "utf8"
    );
    expect(overlay).toMatch(/createPostDistributionPlan/);
    expect(overlay).toMatch(/buildAutomationPlanCreateBody/);
    expect(overlay).toMatch(/result\.previewMediaId/);
    expect(overlay).toMatch(/completeAutomationRun/);
    expect(overlay).toMatch(/cancelAutomationRun/);
    expect(overlay).toMatch(/onDurableAttempt/);
    expect(overlay).not.toMatch(/autonomous.?publish/i);
  });
});
