import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateBody, ReviseBody } from "../../src/conversational-planning/service.js";

const { relayFetch } = vi.hoisted(() => ({ relayFetch: vi.fn() }));
vi.mock("../../web/lib/relay-api", () => ({ relayFetch }));

import {
  approvePlanningPlan,
  cancelPlanningPlan,
  confirmPlanningPlan,
  createPlanningPlan,
  encodePlanningCursor,
  fetchPlanningCapabilities,
  getPlanningPlan,
  getPlanningPreview,
  listPlanningPlans,
  resumePlanningPreparation,
  revisePlanningPlan
} from "../../web/lib/conversational-planning-api";

describe("conversational planning API transport", () => {
  beforeEach(() => relayFetch.mockReset());

  it("reads capability, list, detail and preview through the shared relay transport", async () => {
    const signal = new AbortController().signal;
    relayFetch.mockResolvedValue({ kind: "ok" });
    await fetchPlanningCapabilities(signal);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/capabilities", { signal });

    await listPlanningPlans({ limit: 20 });
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans?limit=20", { signal: undefined });

    await getPlanningPlan("plan /α?", signal);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%20%2F%CE%B1%3F", { signal });

    await getPlanningPreview("plan /α", signal);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%20%2F%CE%B1/preview", { signal });
  });

  it("encodes UTF-8 cursor JSON as bounded unpadded base64url and query-encodes it", async () => {
    const cursor = { updatedAt: "2026-10-17T12:00:00.000Z", id: "cursor-β /?" };
    const encoded = encodePlanningCursor(cursor);
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4)), c => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(cursor));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

    relayFetch.mockResolvedValue({ kind: "ok", items: [], nextCursor: null });
    await listPlanningPlans({ limit: 7, cursor });
    const path = relayFetch.mock.calls[0][0] as string;
    const params = new URLSearchParams(path.slice(path.indexOf("?")));
    expect(path.startsWith("/api/v1/conversational-planning/plans?")).toBe(true);
    expect(params.get("limit")).toBe("7");
    expect(params.get("cursor")).toBe(encoded);
    expect(() => encodePlanningCursor({ updatedAt: "x", id: "界".repeat(2000) })).toThrow(RangeError);
  });

  it("preserves create and AI/manual revision bodies exactly", async () => {
    const signal = new AbortController().signal;
    const createBody = {
      clientMutationKey: "caller-key-1",
      latestRequest: "  Reuse this title exactly.\n",
      selectedPostIds: ["post-1"],
      selectedMediaIds: ["media-1"],
      selectedTemplateIds: ["template-1"]
    } satisfies CreateBody;
    relayFetch.mockResolvedValue({ kind: "clarification", question: "Which time?" });
    await createPlanningPlan(createBody, signal);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans", {
      method: "POST", body: JSON.stringify(createBody), signal
    });

    const aiBody = {
      mode: "ai", clientMutationKey: "caller-key-2", baseRevision: 4,
      latestRequest: " Keep the exact spacing. ", selectedPostIds: ["post-1"], selectedMediaIds: [],
      targetHandleRefs: [{ handle: "edit/α" }]
    } satisfies ReviseBody;
    await revisePlanningPlan("plan/?", aiBody, signal);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%2F%3F/revise", {
      method: "POST", body: JSON.stringify(aiBody), signal
    });

    const manualBody = {
      mode: "manual", clientMutationKey: "caller-key-3", baseRevision: 4,
      patch: [{ step_id: "step-1", field: "note", value: "  keep whitespace  " }]
    } satisfies ReviseBody;
    await revisePlanningPlan("plan-1", manualBody);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan-1/revise", {
      method: "POST", body: JSON.stringify(manualBody)
    });
  });

  it("uses exact review bodies and the CP-08g resume route without extra fields", async () => {
    const planId = "plan/β";
    const reviewBody = { clientMutationKey: "caller-key", baseRevision: 6 } as const;
    relayFetch.mockResolvedValue({ kind: "stored" });
    await approvePlanningPlan(planId, reviewBody);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%2F%CE%B2/approve", { method: "POST", body: JSON.stringify(reviewBody) });
    await cancelPlanningPlan(planId, reviewBody);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%2F%CE%B2/cancel", { method: "POST", body: JSON.stringify(reviewBody) });
    await confirmPlanningPlan(planId, reviewBody);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%2F%CE%B2/confirm", { method: "POST", body: JSON.stringify(reviewBody) });
    const resumeBody = { approvedRevision: 6 } as const;
    await resumePlanningPreparation(planId, resumeBody);
    expect(relayFetch).toHaveBeenLastCalledWith("/api/v1/conversational-planning/plans/plan%2F%CE%B2/resume-preparation", { method: "POST", body: JSON.stringify(resumeBody) });
    expect(relayFetch).toHaveBeenCalledTimes(4);
  });

  it("propagates confirm transport rejection unchanged without retrying", async () => {
    const transportError = new Error("Confirm request outcome is unknown");
    const body = { clientMutationKey: "caller-key", baseRevision: 6 } as const;
    relayFetch.mockRejectedValueOnce(transportError);

    let caught: unknown;
    try {
      await confirmPlanningPlan("plan-1", body);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(transportError);
    expect(relayFetch).toHaveBeenCalledTimes(1);
    expect(relayFetch).toHaveBeenCalledWith("/api/v1/conversational-planning/plans/plan-1/confirm", {
      method: "POST", body: JSON.stringify(body)
    });
  });

});
