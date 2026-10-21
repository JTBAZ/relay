import { describe, expect, it } from "vitest";
import { createBenchDistributionVariantAdapter } from "../../src/editor-bench/distribution-variant-adapter.js";

describe("mock DeviantArt draft schedule integrity", () => {
  it("rejects a schedule row that changes the approved description or tags", async () => {
    const adapter = createBenchDistributionVariantAdapter();
    const identity = "da-preview-draft";
    const plan = { id: "plan-1", creatorId: "creator-1" };
    const variant = {
      id: "variant-1", planId: plan.id, creatorId: plan.creatorId, destination: "deviantart", status: "draft", assistantEnabled: false,
      scheduledFor: null, title: "Tide line sketch", bodyText: "Approved description", postText: null, tags: ["coast", "study"], platformFields: { media_version: "preview" }
    };
    await adapter.commitDraft(identity, { creatorId: plan.creatorId, destination: "deviantart" }, () => ({ plan, variant }));
    const dueAt = "2027-03-28T11:00:00.000Z";
    await expect(adapter.scheduleDraft(identity, { dueAt }, rows => ({
      variant: { ...rows.variant, bodyText: "Changed after review", scheduledFor: dueAt },
      event: { id: "event-1", source: "manual_event", event_type: "make_post", action: "post", destination: "deviantart", status: "pending", title: rows.variant.title, due_at: dueAt, post_id: null, media_ids: [], linkage: { plan_id: rows.variant.planId, variant_id: rows.variant.id } }
    }))).rejects.toThrow("The mock schedule record failed its draft-only checks.");
    expect(adapter.readDraftState(plan.creatorId, variant.id)).toMatchObject({ event: null, currentRows: { variant: { bodyText: "Approved description", tags: ["coast", "study"], scheduledFor: null } } });
  });
});
