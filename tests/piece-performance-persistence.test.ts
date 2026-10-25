import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { readPiecePerformanceBinding, type PiecePerformanceBindingRequest, type PiecePerformanceFacts } from "../src/analytics/piece-performance-facts.js";
import { buildPiecePerformanceFindings, finalizePiecePerformanceAnswer, validatePiecePerformanceAnswer } from "../src/analytics/piece-performance-findings.js";
import { GalleryEditorService } from "../src/gallery-editor/service.js";
import { runEditorIntent, type EditorReadTools } from "../src/gallery-editor/intent.js";
import type { EditorProvider } from "../src/gallery-editor/provider.js";

const creatorId = "creator-a", actorId = "actor-a", sessionId = "session-a";
const bindingRequest: PiecePerformanceBindingRequest = { selectedPostIds: ["post-a"], subject: { kind: "post", id: "post-a" } };

function answer(subject: PiecePerformanceFacts["subject"] = { kind: "post", id: "post-a", title: "A title", post_ids: ["post-a"] }) {
  const facts: PiecePerformanceFacts = {
    as_of: "2026-10-23T12:00:00.000Z", range: "30d", time_range: { start: "2026-09-23T00:00:00.000Z", end: "2026-10-23T12:00:00.000Z" },
    subject, subject_fingerprint: "fingerprint", status: "no_data", metrics: [],
    coverage: [{ id: "coverage-a", post_id: subject.post_ids[0]!, destination: "x", state: "no_observations", missing_metrics: ["impressions"] }], source_failures: []
  };
  const findings = buildPiecePerformanceFindings(facts);
  if (!findings.ok) throw new Error("Expected bounded fixture findings.");
  return finalizePiecePerformanceAnswer(facts, findings.findings, null, { status: "deterministic", reason: "no_data" });
}

function harness(options: { block?: "update" | "readback" | "binding"; casMiss?: boolean } = {}) {
  const row: any = {
    id: sessionId, creatorId, actorId, revision: 3, context: { selectedPostIds: ["post-a"], conversation: { catalogRevision: "saved", excludedPostIds: [], lastRequest: "prior", selectionInitialized: true } },
    messages: [{ role: "assistant", text: "An older legacy message." }],
    cart: { revision: 2, actions: [{ id: "manual", kind: "rename_post", postId: "post-a", title: "Pending title" }], items: [{ id: "item-a" }], dependencies: { post: "v1" }, conflicts: [], notice: "notice", origin: "manual", actionOrigins: { manual: "manual" } }
  };
  let sessionReadCount = 0;
  let enterBlocked!: () => void, releaseBlocked!: () => void;
  const entered = new Promise<void>(resolve => { enterBlocked = resolve; });
  const blocked = new Promise<void>(resolve => { releaseBlocked = resolve; });
  const writes: any[] = [];
  let currentTitle = "A title";
  let currentMembers = [{ postId: "post-a", sortOrder: 0 }, { postId: "post-b", sortOrder: 1 }];
  let currentLinks: any[] = [];
  let currentPresentation: any = null;
  let currentPostWork: any = null;
  let currentWorkMode = "independent";
  let currentSeries: any = null;
  let blockBinding = options.block === "binding";
  const tx: any = {
    tenant: { findUnique: async ({ where }: any) => where.relayCreatorId === creatorId ? { id: "tenant-a" } : null },
    post: {
      count: async ({ where }: any) => where.creatorId === creatorId && where.id.in.includes("post-a") ? 1 : 0,
      findMany: async ({ where }: any) => where.creatorId === creatorId ? where.id.in.map((id: string) => ({ id })) : [],
      findFirst: async ({ where }: any) => where.id === "post-a" && where.creatorId === creatorId ? { id: "post-a", versions: [{ title: currentTitle }], presentation: structuredClone(currentPresentation), creativeWorkMember: structuredClone(currentPostWork) } : null
    },
    creativeWork: { findFirst: async ({ where }: any) => where.id === "work-a" && where.creatorId === creatorId ? { id: "work-a", creatorId, title: currentTitle, titleMode: currentWorkMode, seriesMember: structuredClone(currentSeries), members: structuredClone(currentMembers) } : null },
    platformInstance: { findMany: async ({ where }: any) => { if (where.creatorId !== creatorId) throw new Error("unscoped binding query"); if (blockBinding) { enterBlocked(); await blocked; } return structuredClone(currentLinks); } },
    galleryEditorSession: {
      findFirst: async ({ where }: any) => {
        sessionReadCount++;
        if (where.id !== sessionId || where.creatorId !== creatorId || where.actorId !== actorId) return null;
        if (options.block === "readback" && sessionReadCount === 2) { enterBlocked(); await blocked; }
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        writes.push(data);
        if (options.casMiss || where.id !== sessionId || where.creatorId !== creatorId || where.actorId !== actorId || where.revision !== row.revision) return { count: 0 };
        Object.assign(row, data);
        if (options.block === "update") { enterBlocked(); await blocked; }
        return { count: 1 };
      }
    },
    galleryEditorCommit: { findFirst: async () => null }
  };
  const prisma: any = { ...tx, $transaction: async (fn: (client: any) => Promise<any>) => {
    const before = structuredClone(row);
    try { return await fn(tx); } catch (error) { Object.assign(row, before); throw error; }
  } };
  return { row, writes, entered, release: releaseBlocked, editor: new GalleryEditorService(prisma as PrismaClient), prisma,
    setTitle(value: string) { currentTitle = value; }, setMembers(value: typeof currentMembers) { currentMembers = value; }, setLinks(value: any[]) { currentLinks = value; },
    setPresentation(value: any) { currentPresentation = value; }, setPostWork(value: any) { currentPostWork = value; }, setBlockBinding(value: boolean) { blockBinding = value; },
    setWorkNaming(titleMode: string, seriesMember: any) { currentWorkMode = titleMode; currentSeries = seriesMember; } };
}

describe("piece performance session persistence", () => {
  it("appends a validated answer without changing the pending cart and preserves stored conversation context", async () => {
    const state = harness();
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const result = await state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding
    });
    expect(result.revision).toBe(4);
    expect(result.cart).toEqual({ revision: 2, actions: [{ id: "manual", kind: "rename_post", postId: "post-a", title: "Pending title" }], items: [{ id: "item-a" }], dependencies: { post: "v1" }, conflicts: [], notice: "notice", origin: "manual", actionOrigins: { manual: "manual" } });
    expect(result.context.conversation?.lastRequest).toBe("prior");
    expect(result.messages.at(-1)).toMatchObject({ role: "assistant", text: savedAnswer.summary, performanceAnswer: savedAnswer });
    expect(Object.keys(state.writes[0]).sort()).toEqual(["context", "messages", "revision"]);
  });

  it("rejects an answer whose subject differs from the binding before writing", async () => {
    const state = harness();
    const savedAnswer = { ...answer(), subject: { ...answer().subject, title: "Other title" } };
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    await expect(state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding
    })).rejects.toMatchObject({ code: "PERFORMANCE_SUBJECT_CHANGED" });
    expect(state.writes).toHaveLength(0);
  });

  it.each(["title", "membership", "link"] as const)("rejects a %s binding change between evidence and append", async change => {
    const state = harness();
    const workBindingRequest: PiecePerformanceBindingRequest = { selectedPostIds: ["post-a"], subject: { kind: "work", id: "work-a" } };
    const prior = await readPiecePerformanceBinding(state.prisma, creatorId, workBindingRequest);
    expect(prior.ok).toBe(true);
    if (!prior.ok) return;
    const report = answer({ kind: "work", id: "work-a", title: "A title", post_ids: ["post-a", "post-b"] });
    if (change === "title") state.setTitle("Renamed title");
    if (change === "membership") state.setMembers([{ postId: "post-a", sortOrder: 0 }]);
    if (change === "link") state.setLinks([{ id: "link-a", postId: "post-a", destination: "x", externalUrl: "https://x.test/post", externalId: "x-1", attemptId: null, linkedAt: new Date("2026-10-01T00:00:00.000Z"), status: "active" }]);
    await expect(state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: report.summary,
      performanceAnswer: report, bindingRequest: workBindingRequest, binding: prior.binding
    })).rejects.toMatchObject({ code: "PERFORMANCE_SUBJECT_CHANGED" });
    expect(state.writes).toHaveLength(0);
  });

  it("binds the displayed custom post title and changes its fingerprint when the Relay title changes", async () => {
    const state = harness();
    state.setPresentation({ creatorId, titleMode: "custom", relayTitle: "Relay custom title" });
    const first = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(first.ok && first.binding.subject.title).toBe("Relay custom title");
    if (!first.ok) return;
    state.setPresentation({ creatorId, titleMode: "custom", relayTitle: "Updated Relay title" });
    const second = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(second.ok && second.binding.subject.title).toBe("Updated Relay title");
    expect(second.ok && second.binding.subject_fingerprint).not.toBe(first.binding.subject_fingerprint);
  });

  it("resolves inherited post and work titles through the owned work-series naming graph", async () => {
    const state = harness();
    state.setPresentation({ creatorId, titleMode: "inherit_work", relayTitle: null });
    state.setPostWork({ creatorId, creativeWork: { id: "work-a", creatorId, title: "Relay work", titleMode: "independent", seriesMember: null } });
    const inheritedPost = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(inheritedPost.ok && inheritedPost.binding.subject.title).toBe("Relay work");
    state.setWorkNaming("inherit_series", { creatorId, partLabel: "Part One", creativeSeries: { id: "series-a", creatorId, title: "Field Notes" } });
    const workRequest: PiecePerformanceBindingRequest = { selectedPostIds: ["post-a"], subject: { kind: "work", id: "work-a" } };
    const first = await readPiecePerformanceBinding(state.prisma, creatorId, workRequest);
    expect(first.ok && first.binding.subject.title).toBe("Field Notes — Part One");
    if (!first.ok) return;
    state.setWorkNaming("inherit_series", { creatorId, partLabel: "Part One", creativeSeries: { id: "series-a", creatorId, title: "Updated Notes" } });
    const changed = await readPiecePerformanceBinding(state.prisma, creatorId, workRequest);
    expect(changed.ok && changed.binding.subject.title).toBe("Updated Notes — Part One");
    expect(changed.ok && changed.binding.subject_fingerprint).not.toBe(first.binding.subject_fingerprint);
  });

  it("ignores a foreign owner anywhere in the inherited naming graph", async () => {
    const state = harness();
    state.setPresentation({ creatorId, titleMode: "inherit_work", relayTitle: null });
    state.setPostWork({ creatorId, creativeWork: { id: "work-a", creatorId: "foreign-creator", title: "Foreign work", titleMode: "independent", seriesMember: null } });
    const foreignWork = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(foreignWork.ok && foreignWork.binding.subject.title).toBe("A title");
    state.setPostWork({ creatorId, creativeWork: { id: "work-a", creatorId, title: "Owned work", titleMode: "inherit_series", seriesMember: { creatorId, partLabel: "Part One", creativeSeries: { id: "series-a", creatorId: "foreign-creator", title: "Foreign series" } } } });
    const foreignSeries = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(foreignSeries.ok && foreignSeries.binding.subject.title).toBe("Owned work");
  });

  it("enforces actor and creator ownership and fails closed on a compare-and-set race", async () => {
    const state = harness();
    await expect(state.editor.read(creatorId, "other-actor", sessionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(state.editor.read("other-creator", actorId, sessionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const raced = harness({ casMiss: true });
    const racedBinding = await readPiecePerformanceBinding(raced.prisma, creatorId, bindingRequest);
    expect(racedBinding.ok).toBe(true);
    if (!racedBinding.ok) return;
    await expect(raced.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: racedBinding.binding
    })).rejects.toMatchObject({ code: "STALE_CART" });
    expect(raced.row.revision).toBe(3);
  });

  it("keeps the newest 40 messages when appending a read-only turn", async () => {
    const state = harness();
    state.row.messages = Array.from({ length: 39 }, (_, index) => ({ role: "user", text: `old-${index}` }));
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const result = await state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding
    });
    expect(result.messages).toHaveLength(40);
    expect(result.messages[0]?.text).toBe("old-1");
    expect(result.messages.at(-2)?.text).toBe("How is this performing?");
  });

  it("keeps compiled interpretation anchored to cart revision when session revision is higher", async () => {
    const state = harness();
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const appended = await state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding
    });
    expect(appended.revision).toBe(4);
    expect(appended.cart.revision).toBe(2);
    const provider: EditorProvider = { respond: async ({ input }) => {
      const stateText = input.find(item => item.role === "user" && typeof item.content === "string" && item.content.includes("CURRENT_STATE"))?.content as string;
      expect(stateText).toContain('"revision":2');
      expect(stateText).not.toContain('"revision":4');
      return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ revision: 2, outcome: "no_change", question: null, unresolved: [], observations: [], operations: [] }) }] }] };
    } };
    const reads: EditorReadTools = async () => ({ data: { items: [], target: { kind: "post", id: "post-a" }, workIds: [], seriesId: null, total: 0, hasMore: false, nextCursor: null, complete: true } });
    const interpreted = await runEditorIntent(appended, "Keep going", provider, reads, { architecture: "compiled" });
    expect(interpreted.actions).toEqual(appended.cart.actions);
    expect(appended.cart).toEqual(state.row.cart);
  });

  it.each(["update", "readback"] as const)("rolls back the append if the client cancels during %s", async stage => {
    const state = harness({ block: stage });
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const controller = new AbortController();
    const pending = state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding, signal: controller.signal
    });
    await state.entered;
    controller.abort("canceled");
    state.release();
    await expect(pending).rejects.toMatchObject({ code: "intent_aborted" });
    expect(state.row.revision).toBe(3);
    expect(state.row.messages).toHaveLength(1);
    expect(state.writes).toHaveLength(1);
  });

  it("stops before compare-and-set when cancellation arrives during binding revalidation", async () => {
    const state = harness();
    const savedAnswer = answer();
    const binding = await readPiecePerformanceBinding(state.prisma, creatorId, bindingRequest);
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    state.setBlockBinding(true);
    const controller = new AbortController();
    const pending = state.editor.appendPerformanceTurn(creatorId, actorId, sessionId, {
      revision: 3, context: { selectedPostIds: ["post-a"] }, userText: "How is this performing?", assistantText: savedAnswer.summary,
      performanceAnswer: savedAnswer, bindingRequest, binding: binding.binding, signal: controller.signal
    });
    await state.entered;
    controller.abort("canceled");
    state.release();
    await expect(pending).rejects.toMatchObject({ code: "intent_aborted" });
    expect(state.writes).toHaveLength(0);
    expect(state.row.revision).toBe(3);
  });

  it("retains valid JSONB-reordered attachments and replaces malformed attachments with a safe message", async () => {
    const state = harness();
    const savedAnswer = answer();
    const finding = savedAnswer.findings[0];
    if (finding) savedAnswer.findings[0] = { coverage_refs: [...finding.coverage_refs], text: finding.text, code: finding.code, metric_fact_ids: [...finding.metric_fact_ids], id: finding.id };
    expect(validatePiecePerformanceAnswer(savedAnswer)).toBe(true);
    state.row.messages = [{ role: "assistant", text: "ignored", performanceAnswer: savedAnswer }, { role: "assistant", text: "invented value", performanceAnswer: { ...savedAnswer, summary: "1,000 invented views" } }];
    const result = await state.editor.read(creatorId, actorId, sessionId);
    expect(result.messages[0]).toMatchObject({ text: savedAnswer.summary, performanceAnswer: savedAnswer });
    expect(result.messages[1]).toEqual({ role: "assistant", text: "This saved performance answer could not be verified. Ask again to load the latest evidence." });
  });
});
