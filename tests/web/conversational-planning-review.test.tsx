/** @vitest-environment happy-dom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchPlanningCapabilities: vi.fn(), listPlanningPlans: vi.fn(), getPlanningPlan: vi.fn(), getPlanningPreview: vi.fn()
}));
vi.mock("@/lib/conversational-planning-api", () => api);
vi.mock("@/lib/relay-api", () => ({
  RelayApiError: class RelayApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } },
  RelayForbiddenError: class RelayForbiddenError extends Error {},
  RelayServerError: class RelayServerError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
}));
vi.mock("../../web/node_modules/@radix-ui/react-dialog/dist/index.mjs", async () => {
  const ReactModule = await import("react");
  const passthrough = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("div", props, children);
  return {
    Root: ({ children, open }: { children?: React.ReactNode; open: boolean }) => open ? ReactModule.createElement(ReactModule.Fragment, null, children) : null,
    Portal: passthrough, Overlay: passthrough, Content: passthrough,
    Title: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("h2", props, children),
    Description: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("p", props, children),
    Close: ({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean; [key: string]: unknown }) => asChild && ReactModule.isValidElement(children) ? ReactModule.cloneElement(children, props) : ReactModule.createElement("button", props, children)
  };
});
vi.mock("../../web/node_modules/@radix-ui/react-dialog/dist/index.js", async () => {
  const ReactModule = await import("react");
  const passthrough = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("div", props, children);
  return {
    Root: ({ children, open }: { children?: React.ReactNode; open: boolean }) => open ? ReactModule.createElement(ReactModule.Fragment, null, children) : null,
    Portal: passthrough, Overlay: passthrough, Content: passthrough,
    Title: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("h2", props, children),
    Description: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("p", props, children),
    Close: ({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean; [key: string]: unknown }) => asChild && ReactModule.isValidElement(children) ? ReactModule.cloneElement(children, props) : ReactModule.createElement("button", props, children)
  };
});
import { PlanRailSection } from "../../web/app/components/conversational-planning/PlanRailSection";
import { PlanReviewPanel } from "../../web/app/components/conversational-planning/PlanReviewPanel";
import { useConversationalPlanning, type PlanningControllerInput } from "../../web/app/components/conversational-planning/use-conversational-planning";
import { validatePlanShape } from "../../src/conversational-planning/contract";
import { RelayApiError, RelayForbiddenError, RelayServerError } from "@/lib/relay-api";

const capabilities = { enabled: true, ai_enabled: true, ai_available: true, preparation_available: true, required_plan: "autopost" as const, entitled: true as const };
const sourcePlan = {
  schema_version: 1, plan_id: "plan-a", creator_id: "creator-a", revision: 3, review: "proposed",
  source: { kind: "existing_post", post_id: "post-a", selected_media_ids: ["media-a"], creative_work_id: "work-a", creative_series_member_id: "member-a", source_revision: "rev-a" },
  steps: [
    { step_id: "step-source", capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: ["media-a"], target_post_id: "post-a", depends_on: [], enabled: true, title: { mode: "literal", value: "  Exact\nTitle  ", origin: "creator" }, note: "keep  this", time: { kind: "absolute", at_utc: "2026-10-20T17:00:00.000Z", timezone: "Europe/London", local: "2026-10-20T18:00" } },
    { step_id: "step-preview", capability: "prepare_preview", source_step_id: "step-source", template_id: "template-a", template_config_snapshot: { schemaVersion: 1, preset: "tight_crop", aspectKey: "1:1", compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: {}, templateOptions: {}, destination: { selectedDestinationId: "x", customDestinationUrl: null } }, depends_on: ["step-source"], enabled: true, title: { mode: "literal", value: "Saved X preview", origin: "creator" }, note: null, time: null },
    { step_id: "step-x", capability: "prepare_distribution", source_step_id: "step-source", preview_step_id: "step-preview", distribution_group_id: "group-a", destination: "x", copy_title: { mode: "part_substitution", prefix: "Before ", part: "Autumn", suffix: " release", part_source: "creative_series_member" }, depends_on: ["step-source", "step-preview"], enabled: false, title: { mode: "literal", value: "X title", origin: "creator" }, note: null, time: null },
    { step_id: "step-publish", capability: "publish_handoff", distribution_step_id: "step-x", destination: "x", depends_on: ["step-x"], enabled: false, title: { mode: "literal", value: "Hand off", origin: "compiler" }, note: null, time: null },
    { step_id: "step-engagement", capability: "engagement_check", publication_step_id: "step-publish", destination: "x", target_post_id: "post-a", depends_on: ["step-publish"], enabled: false, title: { mode: "literal", value: "Check engagement", origin: "creator" }, note: null, time: { kind: "after_publication_calendar_days", anchor_step_id: "step-publish", day_offset: 2, timezone: "Europe/London", local_time: "09:30" } }
  ],
  distribution_groups: [{ group_id: "group-a", source_step_id: "step-source", preview_step_id: "step-preview", destination_step_ids: ["step-x"] }],
  unresolved_requests: [{ request_id: "request-a", requested_text_quote: "Also share it on Bluesky", intended_capability: "prepare_distribution", intended_destination: "bluesky", blocking_slot_ids: ["slot-a"] }],
  clarifications: [{ slot_id: "slot-a", field: "time", question: "What time should the Bluesky post use?", affected_node_ids: ["request-a", "step-engagement"], blocking: true, reason: "unknown_time" }],
  requested_text_quote: "Reuse this exactly.\nKeep my line break.", created_at: "2026-10-17T09:00:00.000Z", updated_at: "2026-10-17T10:00:00.000Z"
};
const read = (plan = sourcePlan) => ({ kind: "ok" as const, current: plan, pointers: [{ node_id: "step-source", kind: "relay_post", authority_id: "post-a", slot: "relay_post" }], editHandles: [] });
const preview = { kind: "ok" as const, planId: "plan-a", revision: 3, review: "proposed", readiness: { status: "blocked", issues: ["blocking_clarifications"], pointerCount: 1 } };
const page = (items = [sourcePlan], nextCursor: { updatedAt: string; id: string } | null = null) => ({ kind: "ok" as const, items, nextCursor });
const baseInput: PlanningControllerInput = { creatorId: "creator-a", sessionReady: true, studioIdFromSession: true, selectedPostIds: ["p", "p"], selectedMediaIds: ["m"], writeBlocked: false };

function Harness({ input = baseInput }: { input?: PlanningControllerInput }) {
  const controller = useConversationalPlanning(input);
  return <><button onClick={() => controller.open({ kind: "existing", planId: "plan-a" })}>Open saved</button><button onClick={() => controller.open({ kind: "existing", planId: "plan-b" })}>Open plan B</button><button onClick={() => controller.open({ kind: "new" })}>Open selection</button>
    <PlanRailSection capabilities={controller.capabilities} list={controller.list} selectedCount={2} onNew={() => controller.open({ kind: "new" })} onOpen={planId => controller.open({ kind: "existing", planId })} onLoadMore={() => void controller.loadMore()} onReload={() => void controller.reloadIndex()} />
    <PlanReviewPanel view={controller.view} onClose={controller.close} onReload={() => void controller.reloadPlan()} />
  </>;
}
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe("conversational planning read-only review", () => {
  beforeEach(() => {
    api.fetchPlanningCapabilities.mockReset().mockResolvedValue(capabilities);
    api.listPlanningPlans.mockReset().mockResolvedValue(page());
    api.getPlanningPlan.mockReset().mockResolvedValue(read());
    api.getPlanningPreview.mockReset().mockResolvedValue(preview);
  });
  afterEach(() => cleanup());

  it("reads saved details and shows the complete graph, provenance, clarification, time, group and pointer disclosures", async () => {
    expect(validatePlanShape(sourcePlan).ok).toBe(true);
    render(<Harness />);
    await waitFor(() => expect(api.listPlanningPlans).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Reuse this exactly/ }));
    await screen.findByTestId("planning-step-step-source");
    expect(screen.getByTestId("planning-step-step-source").textContent).toContain("  Exact\nTitle  ");
    expect(screen.getAllByText("Literal copy · creator supplied").length).toBeGreaterThan(0);
    expect(screen.getByText("Before Autumn release", { exact: true })).toBeTruthy();
    expect(screen.getByText("Part substitution · part from creative_series_member")).toBeTruthy();
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.getByText(/Europe\/London · UTC 2026-10-20T17:00/)).toBeTruthy();
    expect(screen.getByText(/Day \+2 after publication of step step-publish/)).toBeTruthy();
    expect(screen.getByText("What time should the Bluesky post use?")).toBeTruthy();
    expect(screen.getByText("Also share it on Bluesky")).toBeTruthy();
    fireEvent.click(screen.getByText("Checked authority pointers"));
    expect(screen.getByText("relay_post · relay_post · node step-source · authority post-a")).toBeTruthy();
    expect(screen.getByText(/do not claim preparation, delivery, publication or completion/i)).toBeTruthy();
    expect(api.getPlanningPlan).toHaveBeenCalledTimes(1);
    expect(api.getPlanningPreview).toHaveBeenCalledTimes(1);
  });

  it("prevents a late response from a prior creator/session from appearing", async () => {
    const late = deferred<ReturnType<typeof read>>();
    api.getPlanningPlan.mockReturnValueOnce(late.promise);
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    rerender(<Harness input={{ ...baseInput, creatorId: "creator-b", studioIdFromSession: false }} />);
    expect(screen.queryByText("Reuse this exactly.\nKeep my line break.")).toBeNull();
    late.resolve(read());
    await waitFor(() => expect(screen.queryByText("Exact\nTitle", { exact: true })).toBeNull());
    expect(screen.queryByTestId("planning-detail-error")).toBeNull();
  });

  it("keeps plan B visible when plan A resolves late", async () => {
    const lateA = deferred<ReturnType<typeof read>>();
    const planB = { ...sourcePlan, plan_id: "plan-b", requested_text_quote: "Plan B is current" };
    api.getPlanningPlan.mockImplementation((planId: string) => planId === "plan-a" ? lateA.promise : Promise.resolve(read(planB)));
    api.getPlanningPreview.mockImplementation((planId: string) => Promise.resolve({ ...preview, planId }));
    render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    fireEvent.click(screen.getByText("Open plan B"));
    await screen.findByText("Plan B is current");
    lateA.resolve(read());
    await waitFor(() => expect(screen.getByText("Plan B is current")).toBeTruthy());
    expect(screen.queryByText("Reuse this exactly.\nKeep my line break.")).toBeNull();
  });

  it("clears an already loaded plan synchronously when Studio identity changes", async () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    await screen.findByTestId("planning-step-step-source");
    rerender(<Harness input={{ ...baseInput, creatorId: "creator-b", sessionReady: false }} />);
    expect(screen.queryByTestId("planning-step-step-source")).toBeNull();
    expect(screen.queryByText("Reuse this exactly.\nKeep my line break.")).toBeNull();
  });

  it("discards a pending detail on close and only displays the fresh reopen response", async () => {
    const late = deferred<ReturnType<typeof read>>();
    api.getPlanningPlan.mockReturnValueOnce(late.promise).mockResolvedValueOnce(read());
    render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    fireEvent.click(await screen.findByTestId("planning-review-close"));
    fireEvent.click(screen.getByText("Open saved"));
    await screen.findByTestId("planning-step-step-source");
    late.resolve(read({ ...sourcePlan, requested_text_quote: "Old pending response" }));
    await waitFor(() => expect(screen.getByTestId("planning-step-step-source").textContent).toContain("Exact"));
    expect(screen.queryByText("Old pending response")).toBeNull();
    expect(api.getPlanningPlan).toHaveBeenCalledTimes(2);
  });

  it("rejects mismatched detail/preview revisions and keeps retry explicit", async () => {
    api.getPlanningPreview.mockResolvedValueOnce({ ...preview, revision: 2 });
    render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    expect(await screen.findByTestId("planning-detail-error")).toBeTruthy();
    expect(screen.getByText(/changed while its review was loading/i)).toBeTruthy();
    expect(api.getPlanningPlan).toHaveBeenCalledTimes(1);
    expect(api.getPlanningPreview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("planning-detail-reload"));
    await screen.findByTestId("planning-step-step-source");
    expect(api.getPlanningPlan).toHaveBeenCalledTimes(2);
    expect(api.getPlanningPreview).toHaveBeenCalledTimes(2);
  });

  it("keeps capabilities, list errors, empty results and cursor pagination distinct", async () => {
    const second = { ...sourcePlan, plan_id: "plan-b", requested_text_quote: "Second plan" };
    const cursor = { updatedAt: "2026-10-17T10:00:00.000Z", id: "cursor" };
    api.listPlanningPlans.mockResolvedValueOnce(page([], cursor)).mockResolvedValueOnce(page([], cursor)).mockResolvedValueOnce(page([second]));
    const { rerender } = render(<Harness />);
    await screen.findByTestId("planning-list-empty");
    fireEvent.click(screen.getByText("Open selection"));
    expect(screen.getByText("Posts: p")).toBeTruthy();
    expect(screen.getByText("Media: m")).toBeTruthy();
    rerender(<Harness input={{ ...baseInput, creatorId: "creator-b" }} />);
    await waitFor(() => expect(api.listPlanningPlans).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId("planning-load-more"));
    await screen.findByText("Second plan");
    expect(api.listPlanningPlans).toHaveBeenLastCalledWith({ limit: 20, cursor }, expect.any(AbortSignal));
    expect(api.fetchPlanningCapabilities).toHaveBeenCalledTimes(2);
  });

  it("classifies forbidden, stale-source and unavailable detail errors", async () => {
    const errors = [new RelayForbiddenError("No access"), new RelayApiError("Changed", 409, "stale_source"), new RelayServerError(503, "Unavailable")];
    const expected = [/cannot read that plan/i, /source has changed/i, /unavailable on this environment/i];
    for (let index = 0; index < errors.length; index++) {
      api.getPlanningPlan.mockRejectedValueOnce(errors[index]);
      const { unmount } = render(<Harness />);
      fireEvent.click(screen.getByText("Open saved"));
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByText(expected[index])).toBeTruthy();
      unmount();
    }
  });

  it("keeps the capability/list stream alive when the dialog closes during a pending list read", async () => {
    const pending = deferred<ReturnType<typeof page>>();
    api.listPlanningPlans.mockReturnValueOnce(pending.promise);
    render(<Harness />);
    fireEvent.click(screen.getByText("Open saved"));
    fireEvent.click(await screen.findByTestId("planning-review-close"));
    expect(api.listPlanningPlans.mock.calls[0][1].aborted).toBe(false);
    pending.resolve(page([], null));
    await screen.findByTestId("planning-list-empty");
    expect(screen.queryByTestId("planning-review-panel")).toBeNull();
  });
});
