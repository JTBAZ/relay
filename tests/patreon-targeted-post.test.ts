import { describe, expect, it } from "vitest";
import { deferred, targetedFixture, memoryStore } from "./helpers/patreon-targeted-post.js";

describe("PS-09 current targeted post refresh", () => {
  it("rejects targeted work on a canonical adapter without shared atomic mutations", async () => {
    const store = { ...memoryStore(), supportsAtomicCreatorMutations: false };
    const run = targetedFixture(store); await run.seed();
    await expect(run.refresh()).rejects.toThrow("shared atomic canonical store");
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });
  it("refreshes an old post without discovery or watermark changes", async () => {
    const run = targetedFixture(); await run.seed();
    run.state.post = run.resource("Edited", false);
    await run.refresh();
    expect(await run.post()).toMatchObject({ current: { title: "Edited", tier_ids: ["patreon_tier_9100"] }, is_public: false, upstream_status: "active" });
    expect(run.watermark.get).not.toHaveBeenCalled(); expect(run.watermark.set).not.toHaveBeenCalled();
    expect(run.fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).not.toContain(`/api/oauth2/v2/campaigns/${run.campaignId}/posts`);
  });

  it("retains the independently collected OAuth media while the access stage preserves old associations", async () => {
    const run = targetedFixture(); await run.seed();
    run.state.post = run.resource("New image", false);
    run.state.post.attributes!.content = '<p>New image</p><img src="https://cdn.fixture.example/new.png">';
    await run.refresh();
    const post = await run.post(); expect(post.current.media_ids).toHaveLength(1);
    const snapshot = await run.store.loadForCreator(run.creatorId);
    expect(snapshot.media[run.creatorId]![post.current.media_ids[0]!]!.current.upstream_url).toBe("https://cdn.fixture.example/new.png");
  });

  it.each([404, 410])("retains stable deletion observations across retries and distinguishes a restored deletion episode (%s)", async (status) => {
    const run = targetedFixture(); await run.seed(); run.state.status = status;
    await run.refresh(true); await run.refresh(true);
    let loaded = await run.store.loadForCreator(run.creatorId);
    const observations = Object.entries(loaded.ingest_idempotency).filter(([key]) => key.startsWith("patreon_post_deletion_observed:"));
    expect(observations).toHaveLength(1);
    expect(await run.post()).toMatchObject({ upstream_status: "deleted", versions: [expect.objectContaining({ title: "Original" })] });
    run.state.status = 200; await run.refresh();
    expect((await run.post()).upstream_status).toBe("active");
    expect((await run.post()).versions).toHaveLength(2);
    run.state.status = status; await run.refresh(true);
    loaded = await run.store.loadForCreator(run.creatorId);
    expect(Object.keys(loaded.ingest_idempotency).filter((key) => key.startsWith("patreon_post_deletion_observed:"))).toHaveLength(2);
    expect(loaded.ingest_idempotency[observations[0]![0]]).toEqual(observations[0]![1]);
    expect((await run.post()).upstream_status).toBe("deleted");
  });

  it("rereads a delayed delete and retains the currently existing post", async () => {
    const run = targetedFixture(); await run.seed(); run.state.post = run.resource("Current");
    await run.refresh(true); expect((await run.post()).current.title).toBe("Current");
    expect((await run.post()).upstream_status).toBe("active");
  });

  it.each([403, 404])("never infers deletion from an update failure (%s)", async (status) => {
    const run = targetedFixture(); await run.seed(); run.state.status = status;
    await expect(run.refresh()).rejects.toThrow(); expect((await run.post()).upstream_status).toBe("active");
  });

  it("never infers signed deletion from a timeout or 403", async () => {
    const run = targetedFixture(); await run.seed(); run.state.status = 403;
    await expect(run.refresh(true)).rejects.toThrow();
    run.state.postResponse = async () => { throw new Error("timeout"); };
    await expect(run.refresh(true)).rejects.toThrow("interrupted");
    expect((await run.post()).upstream_status).toBe("active");
  });

  it("rejects a mismatched resource campaign and protects Relay-native records", async () => {
    const run = targetedFixture(); await run.seed();
    run.state.post.relationships!.campaign!.data = { type: "campaign", id: "999" };
    await expect(run.refresh()).rejects.toThrow("campaign");
    await run.store.mutateForCreator(run.creatorId, (snapshot) => { snapshot.posts[run.creatorId]![`patreon_post_${run.resourceId}`]!.source = "RELAY"; });
    run.state.status = 404;
    await expect(run.refresh(true)).rejects.toThrow("Relay post");
    expect((await run.post()).upstream_status).toBe("active");
  });

  it("commits the paid gate before slow or failing cookie media and preserves old media", async () => {
    const run = targetedFixture(); await run.seed(); run.state.cookie = true; run.state.post = run.resource("Paid", false);
    const started = deferred<void>(), response = deferred<Response>();
    run.state.cookieResponse = () => { started.resolve(); return response.promise; };
    const pending = run.refresh(); await started.promise;
    expect((await run.post()).is_public).toBe(false); expect((await run.post()).current.tier_ids).toEqual(["patreon_tier_9100"]);
    response.resolve(new Response("{}", { status: 403 }));
    await expect(pending).rejects.toThrow(); expect(run.rejected).toHaveBeenCalledOnce();
    expect((await run.post()).is_public).toBe(false);
  });

  it("rejects an older OAuth response after a separate worker accepts newer state", async () => {
    const first = targetedFixture(); await first.seed();
    const second = targetedFixture(first.store);
    const started = deferred<void>(), response = deferred<Response>();
    first.state.postResponse = () => { started.resolve(); return response.promise; };
    const stale = first.refresh(); await started.promise;
    second.state.post = second.resource("Newer", false); await second.refresh();
    response.resolve(Response.json({ data: first.resource("Stale") }));
    await expect(stale).rejects.toThrow("changed during collection"); expect((await first.post()).current.title).toBe("Newer");
  });

  it("rejects media finishing after a separate worker accepts deletion", async () => {
    const first = targetedFixture(); await first.seed(); first.state.cookie = true;
    const second = targetedFixture(first.store); second.state.status = 404;
    const started = deferred<void>(), response = deferred<Response>();
    first.state.cookieResponse = () => { started.resolve(); return response.promise; };
    const stale = first.refresh(); await started.promise; await second.refresh(true);
    response.resolve(Response.json({ data: first.resource() }));
    await expect(stale).rejects.toThrow("changed during collection"); expect((await first.post()).upstream_status).toBe("deleted");
  });

  it("rejects an older campaign snapshot after targeted deletion", async () => {
    const first = targetedFixture(); await first.seed(); const second = targetedFixture(first.store); second.state.status = 404;
    const started = deferred<void>(), response = deferred<Response>();
    first.state.listResponse = () => { started.resolve(); return response.promise; };
    const stale = first.service.scrapeOrSync(first.creatorId, "ps09-stale-list", { campaign_id: first.campaignId, force_refresh_post_access: true });
    await started.promise; await second.refresh(true); response.resolve(Response.json({ data: [first.resource()] }));
    await expect(stale).rejects.toThrow("changed during collection"); expect((await first.post()).upstream_status).toBe("deleted");
  });
});
