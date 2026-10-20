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
const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const message = { type: "RELAY_CROSS_POST" as const, session_id: sessionId, handoff_id: handoffId, destination: "x" as const };

function handoffPackage(sha256 = digest(bytes), contentUrl = `/api/v1/editor-bench/schedule/conversation/session/${sessionId}/handoff/${handoffId}/media/${mediaId}`) {
  return { data: { session_id: sessionId, handoff_id: handoffId, destination: "x", package: {
    relay_post_id: `bench_handoff_${handoffId}`, title: "Exact copy", body_text: "", post_text: "Exact copy",
    media: [{ media_id: mediaId, filename: `${mediaId}.jpg`, mime_type: "image/jpeg", content_url: contentUrl, sha256 }]
  } } };
}

function jpegResponse(value: Uint8Array): Response {
  return new Response(value, { status: 200, headers: { "content-type": "image/jpeg" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  storage.getGrant.mockResolvedValue({ token: "grant-secret" } as never);
  storage.clearGrant.mockClear();
  storage.clearPendingCrossPost.mockClear();
  storage.setPendingCrossPost.mockClear();
});

describe("mock Conversation X handoff byte transport", () => {
  it("fetches the owned package and JPEG with only the grant, then returns the exact bytes without global pending storage", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      return calls.length === 1 ? Response.json(handoffPackage()) : jpegResponse(bytes);
    }));

    const result = await fetchAndStoreCrossPostPackageFromMessage(message);

    expect(result.ok).toBe(true);
    if (!result.ok || !("packet" in result)) throw new Error("Expected verified handoff packet");
    expect(result.packet.jpeg_base64).toBe(Buffer.from(bytes).toString("base64"));
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

  it("rejects a mismatched JPEG hash", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++calls === 1 ? Response.json(handoffPackage("0".repeat(64))) : jpegResponse(bytes)));
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result).toMatchObject({ ok: false, reason: "package_fetch_failed", detail: "media_hash_mismatch" });
    expect(storage.setPendingCrossPost).not.toHaveBeenCalled();
  });

  it("rejects a nonallowlisted media URL before making the image request", async () => {
    const fetchMock = vi.fn(async () => Response.json(handoffPackage(digest(bytes), "https://attacker.invalid/image.jpg")));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result).toMatchObject({ ok: false, reason: "package_fetch_failed", detail: "invalid_package" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading a JPEG as soon as its stream exceeds the byte limit", async () => {
    let calls = 0;
    const oversized = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_576));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      }
    }), { status: 200, headers: { "content-type": "image/jpeg" } });
    vi.stubGlobal("fetch", vi.fn(async () => ++calls === 1 ? Response.json(handoffPackage()) : oversized));
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result).toMatchObject({ ok: false, reason: "package_fetch_failed", detail: "invalid_media" });
    expect(storage.setPendingCrossPost).not.toHaveBeenCalled();
  });

  it("clears a revoked extension grant on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const result = await fetchAndStoreCrossPostPackageFromMessage(message);
    expect(result).toMatchObject({ ok: false, reason: "grant_revoked" });
    expect(storage.clearGrant).toHaveBeenCalledOnce();
    expect(storage.clearPendingCrossPost).not.toHaveBeenCalled();
  });
});
