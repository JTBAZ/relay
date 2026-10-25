/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LibraryEditorPanel from "../../web/app/components/studio/LibraryEditorPanel";
import type { CommitReceipt, EditAction, EditorSession } from "../../src/gallery-editor/types";
import type { PiecePerformanceAnswer } from "../../src/analytics/piece-performance-findings";
import type { GalleryItem } from "../../web/lib/relay-api";

const api = vi.hoisted(() => ({
  fetchLibraryEditorCapabilities: vi.fn(), createLibraryEditorSession: vi.fn(), fetchLibraryEditorSession: vi.fn(),
  reviseLibraryEditorSession: vi.fn(), sendLibraryEditorMessage: vi.fn(), applyLibraryEditorSession: vi.fn(), undoLibraryEditorCommit: vi.fn()
}));
vi.mock("@/lib/gallery-editor-api", () => api);
vi.mock("@/lib/relay-api", () => ({ relayBrowserMediaUrl: (path: string) => path }));
const notice = "Changes titles in Relay. Existing Patreon posts are unchanged.";
const receipt: CommitReceipt = { id: "commit1", sessionId: "session1", committedAt: "2026-10-11T00:00:00Z", actionCount: 1, affectedPostIds: ["post1"], preservedExceptions: ["post2"], notice };
const context = { selectedPostIds: ["post1"], selectedMediaIds: ["media1"], activeCollectionId: "collection1", filters: { query: "paint", includeHidden: true } };
const selectedItems = [{ post_id: "post1", media_id: "media1", title: "Old title", creative_work_id: "work1", naming: { seriesId: "series1" } }] as unknown as GalleryItem[];
let current: EditorSession;
const onChanged = vi.fn();
function fixtureSession(actions: EditAction[] = []): EditorSession {
  return { id: "session1", creatorId: "alice", revision: 1, context, messages: [], cart: { revision: 1, actions, items: actions.map((a) => ({ targetId: "post1", targetType: "post", title: "Old title", before: { title: "Old title" }, after: { title: "title" in a ? a.title : "New title" }, actionIds: [a.id] })), dependencies: {}, conflicts: [], notice } };
}
async function open() {
  render(<LibraryEditorPanel creatorId="alice" context={context} selectedItems={selectedItems} onChanged={onChanged} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit Library" }));
  await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText("Loading draft…")).toBeNull());
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); current = fixtureSession();
  api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: false, notice });
  api.createLibraryEditorSession.mockImplementation(async () => current);
  api.fetchLibraryEditorSession.mockImplementation(async () => current);
  api.reviseLibraryEditorSession.mockImplementation(async (session: EditorSession, actions: EditAction[], nextContext: typeof context) => {
    current = { ...fixtureSession(actions), context: nextContext, revision: session.revision + 1 };
    return current;
  });
  api.sendLibraryEditorMessage.mockImplementation(async (session: EditorSession, message: string) => {
    current = { ...session, revision: session.revision + 1, messages: [{ role: "user", text: message }, { role: "assistant", text: "Which of the two historical titles do you mean?" }] };
    return current;
  });
  api.applyLibraryEditorSession.mockImplementation(async () => { current = { ...fixtureSession(), lastReceipt: receipt }; return { receipt }; });
  api.undoLibraryEditorCommit.mockImplementation(async () => ({ receipt: { ...receipt, reversedAt: "2026-10-11T01:00:00Z" } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Library editor panel", () => {
  it("rebuilds a conflicting preview while preserving the authoritative cart", async () => {
    current = fixtureSession([{id:"a1",kind:"rename_post",postId:"post1",title:"Draft"}]);
    current.cart.conflicts=["Content was undone. Refresh this cart before Apply."];
    await open();
    fireEvent.click(screen.getByRole("button",{name:"Refresh draft"}));
    await waitFor(()=>expect(api.reviseLibraryEditorSession).toHaveBeenCalledWith(expect.objectContaining({revision:1}),[{id:"a1",kind:"rename_post",postId:"post1",title:"Draft"}],context));
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });
  it("shows collection order, media tags, and membership positions before Apply", async () => {
    current=fixtureSession([{id:"order",kind:"reorder_collection",collectionId:"collection1",postIds:["b","a"]}]);
    current.cart.items=[{targetId:"collection1",targetType:"collection",title:"Portfolio",before:{title:"Portfolio",postIds:["a","b"],mediaTags:[{mediaId:"m1",add:["old"],remove:[]}],sortOrder:1},after:{title:"Portfolio",postIds:["b","a"],mediaTags:[{mediaId:"m1",add:["new"],remove:[]}],sortOrder:0},actionIds:["order"]}];
    await open();
    expect(screen.getByText(/Post order: a, b/)).toBeTruthy();
    expect(screen.getByText(/Post order: b, a/)).toBeTruthy();
    expect(screen.getByText(/Position: 2/)).toBeTruthy();
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });
  it("hides completely when capability is disabled", async () => {
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: false, aiAvailable: false, notice });
    const { container } = render(<LibraryEditorPanel creatorId="alice" context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.fetchLibraryEditorCapabilities).toHaveBeenCalledWith("alice", expect.any(AbortSignal)));
    expect(container.innerHTML).toBe("");
  });

  it("previews manual post titles without applying, including selection/filter context", async () => {
    await open();
    expect(screen.getByText("Conversation is unavailable. You can still preview title changes below.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New title"), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview titles" }));
    await waitFor(() => expect(api.reviseLibraryEditorSession).toHaveBeenCalled());
    expect(api.reviseLibraryEditorSession.mock.calls[0][1]).toEqual([expect.objectContaining({ kind: "rename_post", postId: "post1", title: "New title" })]);
    expect(api.reviseLibraryEditorSession.mock.calls[0][2]).toEqual(context);
    expect(screen.getByText("Before")).toBeTruthy(); expect(screen.getByText("After")).toBeTruthy();
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
    expect(screen.getAllByText(notice).length).toBeGreaterThan(0);
  });

  it("provides explicit work/series scopes and preserves custom-title markers", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Change title of"), { target: { value: "work" } });
    fireEvent.change(screen.getByLabelText("New title"), { target: { value: "Shared work" } });
    api.reviseLibraryEditorSession.mockImplementationOnce(async (session: EditorSession, actions: EditAction[]) => ({ ...fixtureSession(actions), revision: session.revision + 1, cart: { ...fixtureSession(actions).cart, items: [{ targetId: "post2", targetType: "post", title: "My exception", before: { title: "My exception" }, after: { title: "My exception" }, actionIds: [], exception: true }] } }));
    fireEvent.click(screen.getByRole("button", { name: "Preview titles" }));
    await waitFor(() => expect(api.reviseLibraryEditorSession).toHaveBeenCalled());
    expect(api.reviseLibraryEditorSession.mock.calls[0][1]).toEqual([expect.objectContaining({ kind: "rename_work", workId: "work1" })]);
    expect(await screen.findByText("post · Custom title preserved")).toBeTruthy();
  });

  it("applies only after review, refreshes Library, and undoes the batch", async () => {
    current = fixtureSession([{ id: "a1", kind: "rename_post", postId: "post1", title: "New title" }]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await screen.findByText("Applied 1 change");
    expect(api.applyLibraryEditorSession).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo this batch" }));
    await screen.findByText("Changes undone");
    expect(api.undoLibraryEditorCommit).toHaveBeenCalledWith("commit1");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("keeps the same idempotency key after a failed Apply response", async () => {
    current = fixtureSession([{ id: "a1", kind: "rename_post", postId: "post1", title: "New title" }]);
    api.applyLibraryEditorSession.mockRejectedValueOnce(new Error("Connection interrupted"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await screen.findByText("Connection interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    await screen.findByText("Applied 1 change");
    expect(api.applyLibraryEditorSession.mock.calls[0][1]).toBe(api.applyLibraryEditorSession.mock.calls[1][1]);
  });

  it("blocks conflicting Apply and allows removing a proposal", async () => {
    current = fixtureSession([{ id: "a1", kind: "rename_post", postId: "post1", title: "New title" }]);
    current.cart.conflicts = ["Post changed since preview"];
    await open();
    expect((screen.getByRole("button", { name: "Apply 1 change" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove actions affecting Old title" }));
    await waitFor(() => expect(api.reviseLibraryEditorSession).toHaveBeenCalled());
    expect(api.reviseLibraryEditorSession.mock.calls[0][1]).toEqual([]);
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });

  it("revises a title proposal while preserving the other actions", async () => {
    current = fixtureSession([{ id: "a1", kind: "rename_post", postId: "post1", title: "Draft title" }, { id: "a2", kind: "tags", postId: "post1", add: ["art"], remove: [] }]);
    await open();
    fireEvent.click(screen.getByText("Revise a proposed title"));
    fireEvent.click(screen.getByRole("button", { name: "Draft title" }));
    fireEvent.change(screen.getByLabelText("New title"), { target: { value: "Revised title" } });
    fireEvent.click(screen.getByRole("button", { name: "Update preview" }));
    await waitFor(() => expect(api.reviseLibraryEditorSession).toHaveBeenCalled());
    expect(api.reviseLibraryEditorSession.mock.calls[0][1]).toEqual([{ id: "a1", kind: "rename_post", postId: "post1", title: "Revised title" }, { id: "a2", kind: "tags", postId: "post1", add: ["art"], remove: [] }]);
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });

  it("shows clarification conversation without calling Apply", async () => {
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, notice });
    await open();
    fireEvent.change(screen.getByLabelText("What would you like to change?"), { target: { value: "Rename the old shared title" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose changes" }));
    await screen.findByText("Which of the two historical titles do you mean?");
    expect(api.sendLibraryEditorMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "session1" }), "Rename the old shared title", context, undefined, expect.any(AbortSignal));
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });

  it("freezes a one-post subject across duplicate media and selection changes while Send is pending", async () => {
    const twoPosts = { ...context, selectedPostIds: ["post1"], selectedMediaIds: ["media1", "media2"] };
    const items = [selectedItems[0]!, { ...selectedItems[0]!, media_id: "media2" }];
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    let resolveTurn!: (value: EditorSession) => void;
    api.sendLibraryEditorMessage.mockImplementationOnce(() => new Promise<EditorSession>((resolve) => { resolveTurn = resolve; }));
    const view = render(<LibraryEditorPanel creatorId="alice" inline context={twoPosts} selectedItems={items} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading draft…")).toBeNull());
    fireEvent.change(screen.getByLabelText("Performance scope"), { target: { value: "post" } });
    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Show performance" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(1);
    expect(api.sendLibraryEditorMessage.mock.calls[0][2]).toEqual(twoPosts);
    expect(api.sendLibraryEditorMessage.mock.calls[0][3]).toEqual({ kind: "post", id: "post1" });
    const signal = api.sendLibraryEditorMessage.mock.calls[0][4] as AbortSignal;
    view.rerender(<LibraryEditorPanel creatorId="alice" inline context={{ ...context, selectedPostIds: ["post2"] }} selectedItems={[{ ...selectedItems[0]!, post_id: "post2" }]} onChanged={onChanged} />);
    resolveTurn({ ...fixtureSession(), revision: 2, messages: [{ role: "assistant", text: "Saved answer for post1" }] });
    await screen.findByText("Saved answer for post1");
    const composer = screen.getByLabelText("Your request") as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(composer.disabled).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(api.applyLibraryEditorSession).not.toHaveBeenCalled();
  });

  it("uses the explicit work scope only when selected anchors share one work", async () => {
    const workContext = { ...context, selectedPostIds: ["post1", "post2"] };
    const workItems = [selectedItems[0]!, { ...selectedItems[0]!, post_id: "post2", media_id: "media2" }];
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    render(<LibraryEditorPanel creatorId="alice" inline context={workContext} selectedItems={workItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading draft…")).toBeNull());
    fireEvent.change(screen.getByLabelText("Performance scope"), { target: { value: "work" } });
    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Compare this work" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalled());
    expect(api.sendLibraryEditorMessage.mock.calls[0][3]).toEqual({ kind: "work", id: "work1" });
    expect(api.sendLibraryEditorMessage.mock.calls[0][2].selectedPostIds).toEqual(["post1", "post2"]);
  });

  it("keeps a failed request in the composer and restores focus", async () => {
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    api.sendLibraryEditorMessage.mockRejectedValueOnce(new Error("The request could not be sent."));
    render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    const composer = screen.getByLabelText("Your request") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "How did this post perform?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await screen.findByText("The request could not be sent.");
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(composer.value).toBe("How did this post perform?");
    expect(composer.closest(".studio-composer")?.querySelector('[role="alert"]')?.textContent).toContain("The request could not be sent.");
  });

  it("scrolls only to a newly appended performance answer header and respects reduced motion", async () => {
    const answer = {
      v: 1, kind: "piece_performance", report_id: "new-report", status: "no_data",
      subject: { kind: "post", id: "post1", title: "Old title", post_ids: ["post1"] },
      as_of: "2026-10-22T12:00:00.000Z", range: "30d", time_range: { start: "2026-09-22T12:00:00.000Z", end: "2026-10-22T12:00:00.000Z" }, destination: null,
      metrics: [], coverage: [], source_failures: [], findings: [], summary: "New recorded answer.",
      synthesis: { status: "deterministic", reason: "no_data" }, links: [{ kind: "view_analytics", href: "/studio/analytics" }]
    } as PiecePerformanceAnswer;
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    api.sendLibraryEditorMessage.mockImplementationOnce(async (session: EditorSession, message: string) => ({
      ...session, revision: session.revision + 1,
      messages: [...session.messages, { role: "user", text: message }, { role: "assistant", text: answer.summary, performanceAnswer: answer }]
    }));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, media: "(prefers-reduced-motion: reduce)" } as MediaQueryList);
    const view = render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading draft…")).toBeNull());
    const scrollContainer = view.container.querySelector(".studio-conversation-scroll") as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperty(scrollContainer, "scrollTo", { configurable: true, value: scrollTo });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 40, writable: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if ((this as HTMLElement).dataset.performanceReport === "new-report") return { top: 1325 } as DOMRect;
      if ((this as HTMLElement).classList.contains("studio-conversation-scroll")) return { top: 56 } as DOMRect;
      return { top: 0 } as DOMRect;
    });

    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Show performance" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1309, behavior: "auto" }));
    view.rerender(<LibraryEditorPanel creatorId="alice" inline context={{ ...context, filters: { query: "changed", includeHidden: false } }} selectedItems={selectedItems} onChanged={onChanged} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("renders a structured performance answer restored from the saved session", async () => {
    const savedAnswer = {
      v: 1, kind: "piece_performance", report_id: "r1", status: "no_data",
      subject: { kind: "post", id: "post1", title: "Old title", post_ids: ["post1"] },
      as_of: "2026-10-22T12:00:00.000Z", range: "30d", time_range: { start: "2026-09-22T12:00:00.000Z", end: "2026-10-22T12:00:00.000Z" }, destination: null,
      metrics: [], coverage: [], source_failures: [], findings: [], summary: "No recorded observations were available.",
      synthesis: { status: "deterministic", reason: "no_data" }, links: [{ kind: "view_analytics", href: "/studio/analytics" }]
    } as PiecePerformanceAnswer;
    current = { ...fixtureSession(), messages: [{ role: "assistant", text: savedAnswer.summary, performanceAnswer: savedAnswer }] };
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await screen.findByText("No recorded observations were available.");
    expect(screen.getByText("Old title")).toBeTruthy();
    expect(screen.getByText(/30d/)).toBeTruthy();
    expect(screen.queryByText("AI summary is unavailable; recorded facts are shown below.")).toBeNull();
    expect(api.sendLibraryEditorMessage).not.toHaveBeenCalled();
  });

  it("ignores a late rejection from a previous creator lifecycle after A to B to A", async () => {
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    let rejectOld!: (reason: Error) => void;
    api.sendLibraryEditorMessage.mockImplementationOnce(() => new Promise<EditorSession>((_resolve, reject) => { rejectOld = reject; }));
    const view = render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "First turn" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(1));
    const oldSignal = api.sendLibraryEditorMessage.mock.calls[0][4] as AbortSignal;
    view.rerender(<LibraryEditorPanel creatorId="bob" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    view.rerender(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(oldSignal.aborted).toBe(true));
    await waitFor(() => expect(api.createLibraryEditorSession.mock.calls.some((call) => call[0] === "alice")).toBe(true));
    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Current turn" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(2));
    rejectOld(new Error("stale failure"));
    await screen.findByText("Which of the two historical titles do you mean?");
    expect(screen.queryByText("stale failure")).toBeNull();
  });

  it("does not accept a delayed saved-session response from an earlier creator lifecycle", async () => {
    let resolveOld!: (value: EditorSession) => void;
    api.createLibraryEditorSession.mockImplementationOnce(() => new Promise<EditorSession>((resolve) => { resolveOld = resolve; }));
    api.createLibraryEditorSession.mockImplementation(async (owner: string) => ({ ...fixtureSession(), creatorId: owner, messages: [{ role: "assistant", text: "Fresh session" }] }));
    const view = render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalledTimes(1));
    view.rerender(<LibraryEditorPanel creatorId="bob" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    view.rerender(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await screen.findByText("Fresh session");
    resolveOld({ ...fixtureSession(), messages: [{ role: "assistant", text: "Stale session" }] });
    await waitFor(() => expect(screen.queryByText("Stale session")).toBeNull());
    expect(screen.getByText("Fresh session")).toBeTruthy();
  });

  it("hydrates creator prompts before persisting when switching between studios", async () => {
    localStorage.setItem("relay.lab2.prompt:alice", "Alice saved prompt");
    localStorage.setItem("relay.lab2.prompt:bob", "Bob saved prompt");
    api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true, performance: { enabled: true, aiAvailable: true }, notice });
    const view = render(<LibraryEditorPanel creatorId="alice" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect((screen.getByLabelText("Your request") as HTMLTextAreaElement).value).toBe("Alice saved prompt"));
    view.rerender(<LibraryEditorPanel creatorId="bob" inline context={context} selectedItems={selectedItems} onChanged={onChanged} />);
    await waitFor(() => expect((screen.getByLabelText("Your request") as HTMLTextAreaElement).value).toBe("Bob saved prompt"));
    expect(localStorage.getItem("relay.lab2.prompt:alice")).toBe("Alice saved prompt");
    expect(localStorage.getItem("relay.lab2.prompt:bob")).toBe("Bob saved prompt");
  });
});

