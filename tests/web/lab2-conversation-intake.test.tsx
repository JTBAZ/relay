/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Lab2ConversationIntake from "@/app/components/studio-lab2/Lab2ConversationIntake";
import type { EditorSession } from "@/lib/gallery-editor-api";
import type { AutopostDraftWire } from "@/lib/relay-api";
import { RELAY_LIBRARY_STAGING_REFRESH } from "../../web/lib/library-staging-events";

const api = vi.hoisted(() => ({
  fetchCreatorStyleProfile: vi.fn(), putCreatorStyleProfile: vi.fn(), fetchRelayLibraryStaging: vi.fn(), fetchDiscordConnection: vi.fn(), uploadFilesToRelayStaging: vi.fn(),
  createAutopostDraft: vi.fn(), patchAutopostDraft: vi.fn(), fetchAutopostDraft: vi.fn(),
  fetchLibraryEditorCapabilities: vi.fn(), createLibraryEditorSession: vi.fn(), fetchLibraryEditorSession: vi.fn(), sendLibraryEditorMessage: vi.fn()
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/relay-api", async (original) => ({ ...await original<typeof import("@/lib/relay-api")>(), ...api }));
vi.mock("@/lib/relay-native-staging-upload", () => ({ uploadFilesToRelayStaging: api.uploadFilesToRelayStaging }));
vi.mock("@/lib/gallery-editor-api", () => ({ ...api }));
const context = { selectedPostIds: ["post1"], selectedMediaIds: ["existing1"], loadedPostIds: ["post1"] };
const draft = { draft_id: "draft1", creator_id: "ava", title: "A quiet landscape", body_text: "A new study.", media_ids: ["media1"], intent: "Prepare a caption", status: "drafting", published_post_id: null, updated_at: "2026-10-21T12:00:00.000Z" } as AutopostDraftWire;
const session: EditorSession = { id: "session1", creatorId: "ava", revision: 1, context, messages: [], cart: { revision: 1, actions: [], items: [], dependencies: {}, conflicts: [], notice: "Relay changes only" } };
function mount(selectedContext = context) { return render(<Lab2ConversationIntake creatorId="ava" selection={{ context: selectedContext, selectedItems: [], writeBlocked: false }} onChanged={vi.fn()} onCorridorDragChange={vi.fn()} onAutopost={vi.fn()} />); }
async function attach() {
  const file = new File(["png"], "landscape.png", { type: "image/png" });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/1 files attached/);
}
async function send(message: string) {
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: message } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
}
async function prepareDraft(message: string) {
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: message } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Prepare attached draft" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Prepare attached draft" }));
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  api.fetchCreatorStyleProfile.mockResolvedValue({ profile: { tone_preset: "friendly" } });
  api.putCreatorStyleProfile.mockResolvedValue({ profile: { tone_preset: "friendly" } });
  api.fetchRelayLibraryStaging.mockResolvedValue({ items: [] });
  api.fetchDiscordConnection.mockResolvedValue({ linked: false });
  api.uploadFilesToRelayStaging.mockResolvedValue({ uploaded: [{ media_id: "media1", content_type: "image/png", filename: "landscape.png", byte_size: 3 }], errors: [] });
  api.createAutopostDraft.mockResolvedValue({ draft });
  api.patchAutopostDraft.mockImplementation(async (_id, patch) => ({ draft: { ...draft, ...patch, draft_id: "draft1" } }));
  api.fetchAutopostDraft.mockResolvedValue({ draft });
  api.fetchLibraryEditorCapabilities.mockResolvedValue({ enabled: true, aiAvailable: true });
  api.createLibraryEditorSession.mockResolvedValue(session); api.fetchLibraryEditorSession.mockResolvedValue(session);
  api.sendLibraryEditorMessage.mockResolvedValue({ ...session, messages: [{ role: "user", text: "Rename" }] });
});
afterEach(cleanup);

describe("Lab2 continuous intake and conversation", () => {
  it("attaches a file, carries a link into the request, prepares and corrects a draft without touching Library edits", async () => {
    mount(); await attach();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Reference link"), { target: { value: "https://example.com/reference" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach link" }));
    await prepareDraft("Prepare a short caption");
    await screen.findByLabelText("Draft title");
    expect(api.createAutopostDraft).toHaveBeenCalledWith(expect.objectContaining({ media_ids: ["media1"], generate: true, intent: expect.stringContaining("https://example.com/reference") }));
    expect(api.sendLibraryEditorMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Draft saved. Nothing has been published.")).toBeTruthy();
    expect((screen.getByLabelText("Your request") as HTMLTextAreaElement).value).toBe("");
    await prepareDraft("Make it less formal");
    await waitFor(() => expect(api.patchAutopostDraft).toHaveBeenCalledWith("draft1", expect.objectContaining({ regenerate: true, intent: expect.stringContaining("Correction: Make it less formal") })));
    fireEvent.change(screen.getByLabelText("Draft title"), { target: { value: "Revised title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft changes" }));
    await waitFor(() => expect(api.patchAutopostDraft).toHaveBeenCalledWith("draft1", expect.objectContaining({ title: "Revised title", body_text: "A new study." })));
    expect(screen.getByRole("link", { name: "Open draft" }).getAttribute("href")).toBe("/studio/autopost?draft_id=draft1");
  });

  it("preserves failed prompts and rehydrates the exact saved draft and references on reload", async () => {
    const view = mount(); await attach();
    api.createAutopostDraft.mockRejectedValueOnce(new Error("AI unavailable. Try again."));
    await prepareDraft("Please make a draft");
    await screen.findByText("AI unavailable. Try again.");
    expect((screen.getByLabelText("Your request") as HTMLTextAreaElement).value).toBe("Please make a draft");
    await prepareDraft("Please make a draft"); await screen.findByLabelText("Draft title");
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Reference link"), { target: { value: "https://example.com/source" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach link" }));
    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "A correction to keep" } });
    fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Local unsaved copy" } });
    view.unmount(); mount();
    await waitFor(() => expect(api.fetchAutopostDraft).toHaveBeenCalledWith("draft1"));
    await screen.findByLabelText("Draft title");
    expect(screen.getByRole("link", { name: "https://example.com/source" })).toBeTruthy();
    expect((screen.getByLabelText("Your request") as HTMLTextAreaElement).value).toBe("A correction to keep");
    expect((screen.getByLabelText("Draft description") as HTMLTextAreaElement).value).toBe("Local unsaved copy");
    expect(api.createAutopostDraft).toHaveBeenCalledTimes(2);
  });

  it("uses actual current selection and carries reference context for existing Library edits", async () => {
    mount();
    await waitFor(() => expect(api.createLibraryEditorSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading draft…")).toBeNull());
    await send("Rename this using https://example.com/reference");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("URL text only"), context, undefined, expect.any(AbortSignal)));
    expect(api.createAutopostDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("relay.lab2.intake:ava") ?? "{}").links).toEqual([]));
  });

  it("keeps unselected named Library questions on the Library path without promoting loaded posts", async () => {
    mount({ ...context, selectedPostIds: [], selectedMediaIds: [] });
    await send("Find my older landscape post and rename it");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalled());
    const sentContext = api.sendLibraryEditorMessage.mock.calls[0]?.[2];
    expect(sentContext.selectedPostIds).toEqual([]);
    expect(api.createAutopostDraft).not.toHaveBeenCalled();
    expect(api.fetchCreatorStyleProfile).not.toHaveBeenCalled();
  });

  it("keeps the original request through first-use style setup", async () => {
    api.fetchCreatorStyleProfile.mockResolvedValueOnce({ profile: null });
    mount(); await attach(); await prepareDraft("Prepare my original request");
    await screen.findByRole("dialog", { name: "Choose your writing style" });
    fireEvent.click(screen.getByRole("button", { name: "Save style & prepare draft" }));
    await screen.findByLabelText("Draft title");
    expect(api.createAutopostDraft).toHaveBeenCalledWith(expect.objectContaining({ intent: "Prepare my original request" }));
  });

  it("keeps generic Library Send pure when a restored draft is attached and prepares it only on the explicit action", async () => {
    localStorage.setItem("relay.lab2.intake:ava", JSON.stringify({ draftId: "draft1", links: [], turns: [] }));
    mount();
    await screen.findByText(/Editing attached draft/);
    const stagingRefresh = vi.fn();
    window.addEventListener(RELAY_LIBRARY_STAGING_REFRESH, stagingRefresh);
    await send("How did this selected post perform?");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalled());
    expect(api.fetchCreatorStyleProfile).not.toHaveBeenCalled();
    expect(api.createAutopostDraft).not.toHaveBeenCalled();
    expect(api.patchAutopostDraft).not.toHaveBeenCalled();
    expect(stagingRefresh).not.toHaveBeenCalled();
    window.removeEventListener(RELAY_LIBRARY_STAGING_REFRESH, stagingRefresh);

    fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Make the attached draft warmer" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare attached draft" }));
    await waitFor(() => expect(api.patchAutopostDraft).toHaveBeenCalledWith("draft1", expect.objectContaining({ regenerate: true, intent: expect.stringContaining("Make the attached draft warmer") })));
  });

  it("does not overwrite a newer server draft with old browser copy", async () => {
    localStorage.setItem("relay.lab2.intake:ava", JSON.stringify({ draftId: "draft1", links: [], turns: [], edits: { title: "Local title", body: "Local text", updatedAt: "old" } }));
    api.fetchAutopostDraft.mockResolvedValueOnce({ draft: { ...draft, title: "New server title", updated_at: "new" } });
    mount(); await screen.findByLabelText("Draft title");
    expect((screen.getByLabelText("Draft title") as HTMLInputElement).value).toBe("New server title");
    fireEvent.click(screen.getByRole("button", { name: "Restore my unsaved copy" }));
    expect((screen.getByLabelText("Draft description") as HTMLTextAreaElement).value).toBe("Local text");
  });

  it("reports upload failure and keeps a working composer", async () => {
    api.uploadFilesToRelayStaging.mockResolvedValue({ uploaded: [], errors: ["Upload failed for landscape.png: unsupported media"] });
    mount();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "landscape.png")] } });
    await screen.findByText("Upload failed for landscape.png: unsupported media");
    expect(screen.queryByText(/1 files attached/)).toBeNull();
    expect((screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove failed files" }));
    await send("Find a post in my Library");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalled());
  });

  it("retains unsaved browser copy when draft restoration fails", async () => {
    const saved = { draftId: "draft1", links: [], turns: [], edits: { title: "Keep this title", body: "Keep this unsaved text", updatedAt: draft.updated_at } };
    localStorage.setItem("relay.lab2.intake:ava", JSON.stringify(saved));
    api.fetchAutopostDraft.mockRejectedValueOnce(new Error("Service unavailable"));
    mount();
    await screen.findByText(/Service unavailable.*Reload to retry/);
    expect(JSON.parse(localStorage.getItem("relay.lab2.intake:ava")!)).toEqual(saved);
  });

  it("allows a selected Library request while an attached draft restore has failed", async () => {
    localStorage.setItem("relay.lab2.intake:ava", JSON.stringify({ draftId: "draft1", links: [], turns: [] }));
    api.fetchAutopostDraft.mockRejectedValueOnce(new Error("Draft service unavailable"));
    mount();
    await screen.findByText(/Draft service unavailable.*Reload to retry/);
    await send("How did this selected post perform?");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(1));
    expect(api.createAutopostDraft).not.toHaveBeenCalled();
    expect(api.fetchCreatorStyleProfile).not.toHaveBeenCalled();
  });

  it("allows a selected Library request while an unrelated upload has failed", async () => {
    api.uploadFilesToRelayStaging.mockResolvedValue({ uploaded: [], errors: ["Upload failed"] });
    mount();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "bad.png")] } });
    await screen.findByText("Upload failed");
    await send("How did this selected post perform?");
    await waitFor(() => expect(api.sendLibraryEditorMessage).toHaveBeenCalledTimes(1));
    expect(api.createAutopostDraft).not.toHaveBeenCalled();
  });
});
