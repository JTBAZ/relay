/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ read: vi.fn(), repair: vi.fn() }));
vi.mock("@/lib/relay-api", async (original) => ({ ...await original<object>(), fetchPatreonSyncState: fixture.read, postPatreonRepair: fixture.repair }));
import PatreonSyncMenu from "../../web/app/components/PatreonSyncMenu";
import SyncHealthBanner from "../../web/app/components/SyncHealthBanner";
import { syncHealthBlocksStudioWrites, type PatreonSyncStateData } from "../../web/lib/relay-api";

const lane = { status: "unknown" as const, scope: null, last_attempt_at: null, last_verified_at: null, counts: null, next_action: null };
const state = (): PatreonSyncStateData => ({ creator_id: "creator", patreon_campaign_id: "1", watermark_published_at: null, watermark_updated_at: null, has_cookie_session: true,
  oauth: { credential_health_status: "healthy", access_token_expires_at: "2099-01-01", access_token_expired: false, access_token_expires_soon: false }, last_post_scrape: null, last_member_sync: null, campaign_display: null,
  sync_health: { status: "healthy", last_success_at: null, last_error: null, campaign_id: "1", message_key: "sync_health.healthy" },
  completeness: { attention: true, archive: { ...lane, status: "partial", counts: { accepted_pages: 1 }, next_action: "continue_sync" }, posts_access: lane, members: lane,
    media: { ...lane, status: "failed", repairs: [{ kind: "post", resource_id: "patreon_post_long_current_resource", head: "a".repeat(64), generation: 2, due_at: "2099-01-01" }] } } });
beforeEach(() => { fixture.read.mockReset().mockResolvedValue(state()); fixture.repair.mockReset().mockResolvedValue({ status: "accepted", completed: false }); });
afterEach(cleanup);
async function open() { render(<PatreonSyncMenu creatorId="creator" onAfterScrape={() => {}} />); fireEvent.click(screen.getByRole("button", { name: "Patreon" })); await screen.findByRole("region", { name: "Saved Patreon coverage" }); }
describe("PS14 existing health controls", () => {
  it("shows partial evidence without changing legacy edit admission", async () => {
    expect(syncHealthBlocksStudioWrites(state())).toBe(false);
    render(<SyncHealthBanner syncState={state()} onViewDetails={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("incomplete or unverified");
    cleanup(); await open();
    expect(screen.getByText("Archive: partial")).toBeTruthy();
    expect(fixture.read).toHaveBeenCalledWith("creator", { campaignId: undefined, probeUpstream: false });
  });
  it("deduplicates pending repair clicks and announces acceptance without completion", async () => {
    let finish!: (value: unknown) => void;
    fixture.repair.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await open();
    const button = screen.getByRole("button", { name: /Retry post/ }); fireEvent.click(button); fireEvent.click(button);
    expect(fixture.repair).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Scheduling…" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ status: "accepted", completed: false });
    await waitFor(() => expect(screen.getByText(/Repair accepted/).getAttribute("role")).toBe("status"));
    expect(screen.getByText(/Repair accepted/).textContent).toContain("completion appears after");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Refresh saved status" })));
  });
  it("retains saved coverage on a read error and exposes failed repair feedback", async () => {
    await open(); fixture.read.mockRejectedValue(new Error("Read unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved status" }));
    expect((await screen.findByRole("alert")).textContent).toContain("previous saved status");
    expect(screen.getByText("Archive: partial")).toBeTruthy();
    fixture.repair.mockRejectedValue(new Error("This item changed. Refresh sync details."));
    fireEvent.click(screen.getByRole("button", { name: /Retry post/ }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((item) => item.textContent?.includes("This item changed"))).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Refresh saved status" })));
  });
  it("closes from the still-focused keyboard trigger on Escape", async () => {
    render(<PatreonSyncMenu creatorId="creator" onAfterScrape={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Patreon" }); trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" }); fireEvent.click(trigger);
    await screen.findByRole("dialog"); expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it.each(["Escape", "Close"])("returns focus to the actual trigger on %s", async (action) => {
    await open();
    if (action === "Escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Patreon" }));
  });
});
