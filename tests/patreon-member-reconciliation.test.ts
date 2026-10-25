import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { refreshMember } from "../src/patreon/reconcile-members.js";
import { memberFixture } from "./helpers/patreon-members.js";
import { singleMemberUrl } from "../src/patreon/patreon-resource-api.js";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

async function fixture() {
  const path = join(await mkdtemp(join(tmpdir(), "relay-ps10-")), "identity.json");
  const store = new FileIdentityStore(path);
  return { ...memberFixture(new IdentityService(store)), store, path };
}
describe("PS10 coordinated file member reconciliation", () => {
  it.each(["substar_tier_injected", " substar_tier_injected "])("preserves initial legacy generic tiers without admitting foreign tier %s", async (foreignTier) => {
    const f = await fixture();
    const user = await f.identity.registerPatreonFallback(f.creatorId, "legacy-generic", "legacy@example.test",
      [" t_silver ", "relay_shared", "patreon_tier_paid", foreignTier]);
    expect(user.tier_ids).toEqual(["patreon_tier_paid", "t_silver", "relay_shared"]);
    expect((await f.store.findByPatreonId("legacy-generic", f.creatorId))!.tier_ids).toEqual(user.tier_ids);
  });
  it.each(["oauth", "member"])("does not admit generic or foreign-provider tiers from a new %s observation", async (source) => {
    const f = await fixture(), tiers = ["generic_injected", "substar_tier_injected", "patreon_tier_paid"];
    if (source === "oauth") {
      const observation = await f.identity.capturePatreonObservation();
      await f.identity.registerPatreonFallback(f.creatorId, "observed", "observed@example.test", tiers, observation);
    } else await f.store.mutatePatreonMembers(f.creatorId, f.campaignId, async (tx) => { await tx.saveUser("observed", tiers); });
    expect((await f.store.findByPatreonId("observed", f.creatorId))!.tier_ids).toEqual(["patreon_tier_paid"]);
  });

  it("uses documented single-member identity and explicit relationships", () => {
    const url = new URL(singleMemberUrl("member-123"));
    expect(url.pathname).toBe("/api/oauth2/v2/members/member-123");
    expect(url.searchParams.get("include")).toBe("campaign,currently_entitled_tiers,user");
    expect(url.searchParams.get("fields[member]")).toContain("patron_status");
  });
  it("resumes more than one capped page across adapter restarts", async () => {
    const f = await fixture();
    f.state.pages = [[f.member()], [f.member("two", "u2")], [f.member("three", "u3")]];
    expect((await f.sync(1)).coverage).toBe("partial");
    const restarted = memberFixture(new IdentityService(new FileIdentityStore(f.path)));
    restarted.state.pages = f.state.pages;
    expect((await restarted.sync(1)).coverage).toBe("partial");
    expect((await f.sync(1)).coverage).toBe("complete");
    expect(Object.keys((await f.store.load()).users)).toHaveLength(3);
  });
  it("an empty roster cannot revoke accepted members", async () => {
    const f = await fixture(); await f.sync(); f.state.pages = [[]];
    expect((await f.sync()).coverage).toBe("blocked");
    expect((await f.store.findByPatreonId("user-one", f.creatorId))!.tier_ids).toEqual(["patreon_tier_paid"]);
  });
  it("keeps an absent legacy identity explicitly unverified until its member binding is established", async () => {
    const f = await fixture(); await f.identity.registerPatreonFallback(f.creatorId, "absent-legacy", "", ["patreon_tier_paid"]);
    const result = await f.sync(); expect(result.coverage).toBe("blocked"); expect(result.warnings.join()).toContain("binding");
    expect((await f.store.findByPatreonId("absent-legacy", f.creatorId))!.tier_ids).toEqual(["patreon_tier_paid"]);
    f.state.pages = [[f.member(), f.member("legacy-member", "absent-legacy")]];
    expect((await f.sync()).coverage).toBe("complete");
  });
  it("invalid member identity rejects the entire page without a false checkpoint", async () => {
    const f = await fixture(); const broken = f.member("bad", "bad-user"); delete broken.relationships!.user;
    f.state.pages = [[f.member(), broken]];
    await expect(f.sync()).rejects.toThrow("identity");
    expect(Object.keys((await f.store.load()).users)).toHaveLength(0);
    expect(Object.values((await f.store.load()).patreon_rosters!)[0]!.phase).toBe("listing");
  });
  it("verifies absent members and preserves other-provider tiers and existing sessions", async () => {
    const f = await fixture(); await f.sync();
    const user = (await f.store.findByPatreonId("user-one", f.creatorId))!;
    await f.store.updateTiers(user.user_id, ["patreon_tier_paid", "substar_tier_keep", "relay_shared"]);
    await f.store.createSession({ token: "session", user_id: user.user_id, creator_id: f.creatorId, tier_ids: user.tier_ids, expires_at: "2099-01-01T00:00:00Z" });
    f.state.pages = [[f.member("new", "new-user", false)]];
    f.state.details.set("member-one", 404);
    expect((await f.sync()).coverage).toBe("complete");
    expect((await f.store.getSession("session"))!.tier_ids).toEqual(["substar_tier_keep", "relay_shared"]);
    expect((await f.store.findByPatreonId("new-user", f.creatorId))!.tier_ids).toEqual([]);
  });
  it("partial traversal and 403 never establish absence", async () => {
    const f = await fixture(); await f.sync();
    f.state.pages = [[f.member("new", "new-user")], [f.member("later", "later-user")]];
    f.state.details.set("member-one", 403);
    expect((await f.sync(1)).coverage).toBe("partial");
    await expect(f.sync(1)).rejects.toThrow();
    expect((await f.store.findByPatreonId("user-one", f.creatorId))!.tier_ids).toEqual(["patreon_tier_paid"]);
  });
  it("rejects campaign mismatches without accepting a page", async () => {
    const f = await fixture(); f.state.pages[0]![0]!.relationships!.campaign = { data: { type: "campaign", id: "999" } };
    await expect(f.sync()).rejects.toThrow("campaign");
    expect(Object.keys((await f.store.load()).users)).toHaveLength(0);
  });
  it("repeated scans retain one join and A-to-B-to-A transitions", async () => {
    const f = await fixture(); await f.sync(); await f.sync();
    f.state.pages = [[f.member("member-one", "user-one", false)]]; await f.sync();
    f.state.pages = [[f.member()]]; await f.sync();
    const events = Object.values((await f.store.load()).patreon_member_events!);
    expect(events.map((row) => row.eventType)).toEqual(["join", "cancel", "rejoin"]);
  });
  it("keeps concurrent session and member writes across independent store instances", async () => {
    const f = await fixture(); const other = new FileIdentityStore(f.path);
    await Promise.all([f.sync(), ...Array.from({ length: 12 }, (_, i) => other.createSession({ token: `s${i}`, user_id: "unrelated", creator_id: "other", tier_ids: [], expires_at: "2099-01-01T00:00:00Z" }))]);
    const root = await f.store.load(); expect(Object.keys(root.sessions)).toHaveLength(12); expect(Object.keys(root.users)).toHaveLength(1);
    expect(() => JSON.parse(JSON.stringify(root))).not.toThrow();
  });
  it("retains identity and session writes from two actual processes", async () => {
    const f = await fixture();
    const child = (prefix: string) => new Promise<void>((done, fail) => {
      const processChild = spawn(process.execPath, [resolve("node_modules/vite-node/vite-node.mjs"), resolve("tests/helpers/patreon-member-file-process.ts")],
        { windowsHide: true, stdio: "ignore", env: { ...process.env, RELAY_MEMBER_FILE_TEST_INPUT: JSON.stringify({ path: f.path, prefix }) } });
      const timeout = setTimeout(() => { processChild.kill(); fail(new Error("Member child timed out")); }, 30_000);
      processChild.on("error", fail); processChild.on("close", (code) => { clearTimeout(timeout); code === 0 ? done() : fail(new Error("Member child failed")); });
    });
    await Promise.all([child("first"), child("second")]);
    const root = await f.store.load(); expect(Object.keys(root.users)).toHaveLength(20); expect(Object.keys(root.sessions)).toHaveLength(20);
  }, 40_000);
  it("rejects corrupt documents and loads legacy identity documents", async () => {
    const f = await fixture(); await writeFile(f.path, "{");
    await expect(f.sync()).rejects.toThrow("corrupt"); expect(await readFile(f.path, "utf8")).toBe("{");
    await writeFile(f.path, JSON.stringify({ users: {}, sessions: {} })); expect((await f.sync()).coverage).toBe("complete");
  });
  it("rejects primitive identity maps and invalid authorization fields", async () => {
    const f = await fixture();
    await writeFile(f.path, JSON.stringify({ users: true, sessions: {} })); await expect(f.store.load()).rejects.toThrow("corrupt");
    await writeFile(f.path, JSON.stringify({ users: {}, sessions: { token: { token: "token", tier_ids: ["paid"], expires_at: "forever" } } }));
    await expect(f.store.getSession("token")).rejects.toThrow("corrupt");
  });
  it("rolls back local identity and checkpoint changes after a ledger failure", async () => {
    const f = await fixture(); const original = f.store.mutatePatreonMembers;
    const mock = vi.spyOn(f.store, "mutatePatreonMembers").mockImplementation((creator, campaign, operation) => original(creator, campaign,
      (tx) => operation({ ...tx, ledger: async () => { throw new Error("local ledger unavailable"); } })));
    await expect(f.sync()).rejects.toThrow("local ledger unavailable");
    expect(Object.keys((await f.store.load()).users)).toHaveLength(0);
    mock.mockRestore(); expect((await f.sync()).coverage).toBe("complete");
    expect(Object.keys((await f.store.load()).patreon_member_events!)).toHaveLength(1);
  });
  it("does not delete a grant renewed before locked expiry cleanup", async () => {
    const f = await fixture();
    await f.store.createSession({ token: "renewed", user_id: "local", creator_id: "local", kind: "extension", tier_ids: [], expires_at: "2000-01-01T00:00:00Z" });
    const original = f.store.load.bind(f.store); let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((done) => { release = done; }); const read = new Promise<void>((done) => { entered = done; });
    vi.spyOn(f.store, "load").mockImplementationOnce(async () => { const stale = await original(); entered(); await gate; return stale; });
    const pending = f.store.getSession("renewed"); await read;
    await new FileIdentityStore(f.path).touchSessionExpiry("renewed"); release();
    expect(await pending).not.toBeNull(); expect(await f.store.getSession("renewed")).not.toBeNull();
  });
  it("does not allow hosted signed processing with a file identity adapter", async () => {
    const f = await fixture(); await expect(f.refresh()).rejects.toThrow("shared transactional"); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("restarts an expired continuation without treating partial coverage as absence", async () => {
    const f = await fixture(); f.state.pages = [[f.member()], [f.member("two", "u2")]];
    await f.sync(1); f.state.pageHook = async () => new Response("{}", { status: 410 });
    await expect(f.sync(1)).rejects.toThrow();
    const state = Object.values((await f.store.load()).patreon_rosters!)[0]!;
    expect(state.nextUrl).toBeNull(); expect(state.phase).toBe("listing");
    expect((await f.store.findByPatreonId("user-one", f.creatorId))!.tier_ids).toEqual(["patreon_tier_paid"]);
  });
  it("fences older accepted collection before it can restore a removed entitlement", async () => {
    const f = await fixture(); await f.sync(); const old = await f.identity.capturePatreonObservation();
    f.state.details.set("member-one", 404); await refreshMember(f.context, "member-one", true);
    await expect(f.identity.registerPatreonFallback(f.creatorId, "user-one", "masked@relay.local", ["patreon_tier_paid"], old)).rejects.toThrow("changed during collection");
    expect((await f.store.findByPatreonId("user-one", f.creatorId))!.tier_ids).toEqual([]);
  });
});
