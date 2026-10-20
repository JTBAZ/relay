import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPackage: vi.fn(), openTab: vi.fn(), waitReady: vi.fn(), inject: vi.fn() }));
vi.mock("../../extension/src/lib/cross-post-fetch", () => ({ fetchAndStoreCrossPostPackageFromMessage: mocks.fetchPackage }));
vi.mock("../../extension/src/lib/cross-post-tab-inject", () => ({ openCrossPostTab: mocks.openTab, waitForCrossPostTabReady: mocks.waitReady, injectCrossPostFillScript: mocks.inject }));

import { runRelayCrossPostFlow } from "../../extension/src/lib/cross-post-flow";
import { decodeBenchXHandoffBytes, encodeBenchXHandoffBytes, isBenchXHandoffPacket, parseBenchXHandoffEnvelope } from "../../extension/src/lib/bench-x-handoff";
import { isExternalCrossPostMessage } from "../../extension/src/lib/cross-post-types";

const sessionId = "a1111111-1111-4111-8111-111111111111";
const handoffA = "b1111111-1111-4111-8111-111111111111";
const handoffB = "c1111111-1111-4111-8111-111111111111";
const message = (handoff_id: string) => ({ type: "RELAY_CROSS_POST", session_id: sessionId, handoff_id, destination: "x" as const });
const deviantArtMessage = (handoff_id: string) => ({ type: "RELAY_CROSS_POST", session_id: sessionId, handoff_id, destination: "deviantart" as const });
const packet = (handoff_id: string, text: string) => ({ version: 1 as const, handoff_id, relay_post_id: `bench_handoff_${handoff_id}`, post_text: text, media_id: `bench_preview_${handoff_id}`, filename: `${handoff_id}.jpg`, sha256: "a".repeat(64), jpeg_base64: "AQID", expires_at: Date.now() + 30_000 });
const deviantArtPacket = (handoff_id: string, title: string) => ({ version: 1 as const, handoff_id, relay_post_id: `bench_handoff_${handoff_id}`, title, body_text: "", tags: [title.toLowerCase()], media_id: `bench_preview_${handoff_id}`, filename: `${handoff_id}.jpg`, sha256: "b".repeat(64), jpeg_base64: "AQID", expires_at: Date.now() + 30_000 });

describe("mock Conversation X handoff transport", () => {
  it("accepts only the exact opaque-ID message and package/media references", () => {
    expect(isExternalCrossPostMessage(message(handoffA))).toBe(true);
    expect(isExternalCrossPostMessage({ ...message(handoffA), content_override: { post_text: "forged" } })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message(handoffA), relay_post_id: "fake" })).toBe(false);
    expect(isExternalCrossPostMessage({ ...message(handoffA), session_id: "not-a-uuid" })).toBe(false);
    const mediaId = "bench_preview_123";
    const contentUrl = `/api/v1/editor-bench/schedule/conversation/session/${sessionId}/handoff/${handoffA}/media/${mediaId}`;
    const raw = { data: { session_id: sessionId, handoff_id: handoffA, destination: "x", package: { relay_post_id: `bench_handoff_${handoffA}`, title: "Exact copy", body_text: "", post_text: "Exact copy", media: [{ media_id: mediaId, filename: `${mediaId}.jpg`, mime_type: "image/jpeg", content_url: contentUrl, sha256: "a".repeat(64) }] } }, meta: { trace_id: "ignored outer metadata" } };
    expect(parseBenchXHandoffEnvelope(raw, sessionId, handoffA)?.pkg.post_text).toBe("Exact copy");
    expect(parseBenchXHandoffEnvelope({ ...raw, data: { ...raw.data, session_id: handoffB } }, sessionId, handoffA)).toBeNull();
    expect(parseBenchXHandoffEnvelope({ ...raw, data: { ...raw.data, package: { ...raw.data.package, media: [{ ...raw.data.package.media[0], content_url: "https://attacker.invalid/image.jpg" }] } } }, sessionId, handoffA)).toBeNull();
  });

  it("survives the JSON-serializable scripting boundary with identical JPEG bytes", () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const payload = { ...packet(handoffA, "Exact copy"), jpeg_base64: encodeBenchXHandoffBytes(original) };
    const transferred = JSON.parse(JSON.stringify(payload));
    expect(isBenchXHandoffPacket(transferred)).toBe(true);
    expect(Array.from(decodeBenchXHandoffBytes(transferred.jpeg_base64)!)).toEqual(Array.from(original));
  });

  it("keeps two concurrent JPEG packets bound to their own compose tabs", async () => {
    const a = packet(handoffA, "Copy A"), b = packet(handoffB, "Copy B");
    mocks.fetchPackage.mockImplementation(async (value: { handoff_id: string }) => ({ ok: true, relay_post_id: `bench_handoff_${value.handoff_id}`, destination: "x", handoff_id: value.handoff_id, packet: value.handoff_id === handoffA ? a : b }));
    mocks.openTab.mockResolvedValueOnce(41).mockResolvedValueOnce(42);
    const ready = new Map<number, () => void>();
    mocks.waitReady.mockImplementation((tabId: number) => new Promise<void>(resolve => ready.set(tabId, resolve)));
    const injected: Array<{ tabId: number; packet: unknown }> = [];
    mocks.inject.mockImplementation(async (tabId: number, _destination: string, boundPacket: unknown) => { injected.push({ tabId, packet: boundPacket }); return true; });
    const first = runRelayCrossPostFlow(message(handoffA)), second = runRelayCrossPostFlow(message(handoffB));
    await vi.waitFor(() => expect(ready.size).toBe(2));
    ready.get(42)!(); ready.get(41)!();
    const results = await Promise.all([first, second]);
    expect(results.map(row => row.ok)).toEqual([true, true]);
    expect(injected).toEqual([{ tabId: 42, packet: b }, { tabId: 41, packet: a }]);
  });

  it("keeps concurrent X and DeviantArt packets bound to their destination tabs", async () => {
    const x = packet(handoffA, "X copy"), da = deviantArtPacket(handoffB, "DA title");
    const xRequest = message(handoffA), daRequest = deviantArtMessage(handoffB);
    mocks.fetchPackage.mockImplementation(async (value: { handoff_id: string; destination: string }) => value.destination === "deviantart"
      ? { ok: true, relay_post_id: `bench_handoff_${value.handoff_id}`, destination: "deviantart", handoff_id: value.handoff_id, packet: da }
      : { ok: true, relay_post_id: `bench_handoff_${value.handoff_id}`, destination: "x", handoff_id: value.handoff_id, packet: x });
    mocks.openTab.mockResolvedValueOnce(51).mockResolvedValueOnce(52);
    const ready = new Map<number, () => void>();
    mocks.waitReady.mockImplementation((tabId: number) => new Promise<void>(resolve => ready.set(tabId, resolve)));
    const injected: Array<{ tabId: number; destination: string; packet: unknown }> = [];
    mocks.inject.mockImplementation(async (tabId: number, destination: string, boundPacket: unknown) => { injected.push({ tabId, destination, packet: boundPacket }); return true; });
    const first = runRelayCrossPostFlow(xRequest), second = runRelayCrossPostFlow(daRequest);
    await vi.waitFor(() => expect(ready.size).toBe(2));
    ready.get(52)!(); ready.get(51)!();
    const results = await Promise.all([first, second]);
    expect(results.map(row => row.ok)).toEqual([true, true]);
    expect(injected).toEqual([
      { tabId: 52, destination: "deviantart", packet: da },
      { tabId: 51, destination: "x", packet: x }
    ]);
  });
});
