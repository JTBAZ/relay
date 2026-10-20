import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getGrant: vi.fn(async () => ({ token: "grant-secret" })),
  clearGrant: vi.fn(async () => undefined),
  clearPendingCrossPost: vi.fn(async () => undefined),
  setPendingCrossPost: vi.fn(async () => undefined)
}));
vi.mock("../../extension/src/lib/storage", () => storage);

import { fetchAndStoreCrossPostPackageFromMessage } from "../../extension/src/lib/cross-post-fetch";

const sessionId = "a1111111-1111-4111-8111-111111111111";
const handoffId = "b1111111-1111-4111-8111-111111111111";
const mediaId = "bench_preview_123";
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 255]);
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const message = { type: "RELAY_CROSS_POST" as const, session_id: sessionId, handoff_id: handoffId, destination: "deviantart" as const };
const contentUrl = `/api/v1/editor-bench/schedule/conversation/session/${sessionId}/deviantart-handoff/${handoffId}/media/${mediaId}`;

function handoffPackage(sha256 = digest(bytes), url = contentUrl) {
  return { data: { session_id: sessionId, handoff_id: handoffId, destination: "deviantart", package: {
    relay_post_id: `bench_handoff_${handoffId}`, title: "Exact title", body_text: "", tags: ["blue", "study"],
    media: [{ media_id: mediaId, filename: `${mediaId}.jpg`, mime_type: "image/jpeg", content_url: url, sha256 }]
  } } };
}

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  storage.getGrant.mockResolvedValue({ token: "grant-secret" } as never);
  storage.clearGrant.mockClear(); storage.clearPendingCrossPost.mockClear(); storage.setPendingCrossPost.mockClear();
});

describe("mock Conversation DeviantArt handoff fetch", () => {
  it("fetches the exact package and verified JPEG with the extension grant and no pending storage", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return calls.length === 1 ? Response.json(handoffPackage()) : new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    }));
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result.ok).toBe(true);
    if (!result.ok || !("packet" in result)) throw new Error("Expected a verified DeviantArt packet");
    expect(result).toMatchObject({ destination: "deviantart", handoff_id: handoffId, relay_post_id: `bench_handoff_${handoffId}`, packet: { title: "Exact title", body_text: "", tags: ["blue", "study"], sha256: digest(bytes), jpeg_base64: Buffer.from(bytes).toString("base64") } });
    expect(calls).toHaveLength(2);
    for (const { url, init } of calls) {
      expect(url).toMatch(/^http:\/\/localhost:\d+\/api\/v1\/editor-bench\/schedule\/conversation\/session\//);
      expect(init?.credentials).toBe("omit");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer grant-secret");
    }
    expect(storage.clearGrant).not.toHaveBeenCalled();
    expect(storage.clearPendingCrossPost).not.toHaveBeenCalled();
    expect(storage.setPendingCrossPost).not.toHaveBeenCalled();
  });

  it("rejects a JPEG whose raw-byte hash differs from the approved package", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++calls === 1 ? Response.json(handoffPackage("0".repeat(64))) : new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } })));
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result).toMatchObject({ ok: false, reason: "package_fetch_failed", detail: "media_hash_mismatch" });
    expect(storage.setPendingCrossPost).not.toHaveBeenCalled();
    expect(storage.clearPendingCrossPost).not.toHaveBeenCalled();
  });
});
