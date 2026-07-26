/**
 * PILOT-014 — Relay-native posts sign-off: UI surfaces, API wiring, compose flow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("PILOT-014 — Relay-native posts optional sign-off", () => {
  it("Library create-post modal and /studio/new-post shell wire relayNativeCreatePost", () => {
    const modal = readFileSync(join(ROOT, "web/app/components/LibraryCreatePostModal.tsx"), "utf8");
    const gallery = readFileSync(join(ROOT, "web/app/studio/GalleryView.tsx"), "utf8");
    const composer = readFileSync(
      join(ROOT, "web/app/components/shell/CreatorRelayPostComposer.tsx"),
      "utf8"
    );
    const newPostPage = readFileSync(join(ROOT, "web/app/studio/new-post/page.tsx"), "utf8");
    expect(modal).toContain("compose-tiers");
    expect(modal).toContain("tierFacets");
    expect(gallery).toContain("fetchRelayComposeTiers");
    expect(gallery).toContain("resolveRelayComposeCampaignId");
    expect(gallery).toContain("campaign_id");
    expect(gallery).toContain("relayNativeCreatePost");
    expect(gallery).toContain("LibraryCreatePostModal");
    expect(composer).toContain("relayNativeCreatePost");
    expect(composer).toContain("composeCampaignId");
    expect(composer).toContain("onCampaignChange");
    expect(newPostPage).toContain("NewPostPageClient");
  });

  it("server exposes compose-tiers, relay/posts, and upload routes", () => {
    const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(server).toMatch(/app\.get\("\/api\/v1\/relay\/compose-tiers"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/relay\/posts"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/relay\/upload\/init"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/relay\/upload\/commit"/);
    expect(server).toContain("createRelayPostTransaction");
    expect(server).toContain("campaign_id: r.campaignId");
  });

  it("create-relay-post persists PostSource.RELAY and tier relay keys", () => {
    const create = readFileSync(join(ROOT, "src/relay/create-relay-post.ts"), "utf8");
    expect(create).toContain("PostSource.RELAY");
    expect(create).toContain("isMediaEligibleForRelayNativePost");
    expect(create).toContain("resolveCampaignIdForRelayPost");
  });

  it("relay-api exports compose, upload, and create helpers", () => {
    const api = readFileSync(join(ROOT, "web/lib/relay-api.ts"), "utf8");
    expect(api).toContain("fetchRelayComposeTiers");
    expect(api).toContain("resolveRelayComposeCampaignId");
    expect(api).toContain("relayNativeUploadInit");
    expect(api).toContain("relayNativeUploadCommit");
    expect(api).toContain("relayNativeCreatePost");
  });
});
