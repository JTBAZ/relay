import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { decodeBenchXHandoffBytes } from "../../extension/src/lib/bench-x-handoff";
import { createBenchDeviantArtHandoffPacket, isBenchDeviantArtHandoffPacket, parseBenchDeviantArtHandoffEnvelope } from "../../extension/src/lib/bench-deviantart-handoff";
import { isExternalCrossPostMessage } from "../../extension/src/lib/cross-post-types";

const sessionId = "a1111111-1111-4111-8111-111111111111";
const handoffId = "b1111111-1111-4111-8111-111111111111";
const mediaId = "bench_preview_123";
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const hash = createHash("sha256").update(bytes).digest("hex");
const url = `/api/v1/editor-bench/schedule/conversation/session/${sessionId}/deviantart-handoff/${handoffId}/media/${mediaId}`;
const raw = { data: { session_id: sessionId, handoff_id: handoffId, destination: "deviantart", package: { relay_post_id: `bench_handoff_${handoffId}`, title: "Exact title", body_text: "", tags: ["blue", "study"], media: [{ media_id: mediaId, filename: `${mediaId}.jpg`, mime_type: "image/jpeg", content_url: url, sha256: hash }] } }, meta: { trace_id: "ignored outer metadata" } };

describe("mock Conversation DeviantArt handoff packet", () => {
  it("accepts only the exact destination-qualified message and package shape", () => {
    const message = { type: "RELAY_CROSS_POST", session_id: sessionId, handoff_id: handoffId, destination: "deviantart" };
    expect(isExternalCrossPostMessage(message)).toBe(true);
    expect(isExternalCrossPostMessage({ ...message, destination: "x" })).toBe(true);
    expect(isExternalCrossPostMessage({ ...message, relay_post_id: "forged" })).toBe(false);
    expect(parseBenchDeviantArtHandoffEnvelope(raw, sessionId, handoffId)?.pkg.body_text).toBe("");
    expect(parseBenchDeviantArtHandoffEnvelope({ ...raw, data: { ...raw.data, destination: "x" } }, sessionId, handoffId)).toBeNull();
    expect(parseBenchDeviantArtHandoffEnvelope({ ...raw, data: { ...raw.data, package: { ...raw.data.package, media: [{ ...raw.data.package.media[0], content_url: "https://attacker.invalid/image.jpg" }] } } }, sessionId, handoffId)).toBeNull();
  });

  it("keeps the exact JPEG bytes and frozen title, description and tags across JSON transfer", () => {
    const parsed = parseBenchDeviantArtHandoffEnvelope(raw, sessionId, handoffId)!;
    const packet = createBenchDeviantArtHandoffPacket({ handoffId, pkg: parsed.pkg, bytes, sha256: parsed.mediaHash, now: 1_000 });
    const transferred = JSON.parse(JSON.stringify(packet));
    expect(isBenchDeviantArtHandoffPacket(transferred, 1_001)).toBe(true);
    expect(transferred).toMatchObject({ title: "Exact title", body_text: "", tags: ["blue", "study"], sha256: hash });
    expect(Array.from(decodeBenchXHandoffBytes(transferred.jpeg_base64)!)).toEqual(Array.from(bytes));
    expect(isBenchDeviantArtHandoffPacket({ ...transferred, expires_at: 1_000 }, 1_001)).toBe(false);
  });
});
