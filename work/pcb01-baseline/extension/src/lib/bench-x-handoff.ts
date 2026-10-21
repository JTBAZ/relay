import type { XCrossPostPackage } from "./cross-post-types";

export const BENCH_X_HANDOFF_PACKET_KEY = "__relayBenchXHandoffPacket" as const;
export const BENCH_X_HANDOFF_MAX_BYTES = 1024 * 1024;
export const BENCH_X_HANDOFF_PACKET_TTL_MS = 60_000;

export type BenchXHandoffPacket = {
  version: 1;
  handoff_id: string;
  relay_post_id: string;
  post_text: string;
  media_id: string;
  filename: string;
  sha256: string;
  jpeg_base64: string;
  expires_at: number;
};

export function parseBenchXHandoffEnvelope(raw: unknown, sessionId: string, handoffId: string): { pkg: XCrossPostPackage; mediaHash: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = (raw as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const envelope = data as Record<string, unknown>;
  if (Object.keys(envelope).length !== 4 || envelope.session_id !== sessionId || envelope.handoff_id !== handoffId || envelope.destination !== "x" || !envelope.package || typeof envelope.package !== "object" || Array.isArray(envelope.package)) return null;
  const rawPackage = envelope.package as Record<string, unknown>;
  if (Object.keys(rawPackage).length !== 5 || typeof rawPackage.relay_post_id !== "string" || !rawPackage.relay_post_id.startsWith("bench_handoff_") || typeof rawPackage.title !== "string" || typeof rawPackage.body_text !== "string" || typeof rawPackage.post_text !== "string" || !rawPackage.post_text.trim() || rawPackage.title !== rawPackage.post_text || rawPackage.body_text !== "" || !Array.isArray(rawPackage.media) || rawPackage.media.length !== 1) return null;
  const media = rawPackage.media[0];
  if (!media || typeof media !== "object" || Array.isArray(media)) return null;
  const item = media as Record<string, unknown>;
  const expectedUrl = `/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}/handoff/${encodeURIComponent(handoffId)}/media/${encodeURIComponent(String(item.media_id ?? ""))}`;
  if (Object.keys(item).length !== 5 || typeof item.media_id !== "string" || !item.media_id.startsWith("bench_preview_") || typeof item.filename !== "string" || !item.filename.endsWith(".jpg") || item.mime_type !== "image/jpeg" || item.content_url !== expectedUrl || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) return null;
  return { pkg: { relay_post_id: rawPackage.relay_post_id, title: rawPackage.title, body_text: "", post_text: rawPackage.post_text, media: [{ media_id: item.media_id, filename: item.filename, mime_type: "image/jpeg", content_url: item.content_url }] }, mediaHash: item.sha256 };
}

export function isBenchXHandoffPacket(value: unknown): value is BenchXHandoffPacket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const packet = value as Record<string, unknown>;
  return Object.keys(packet).length === 9 && packet.version === 1 && typeof packet.handoff_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(packet.handoff_id) && typeof packet.relay_post_id === "string" && packet.relay_post_id.startsWith("bench_handoff_") && typeof packet.post_text === "string" && packet.post_text.trim().length > 0 && typeof packet.media_id === "string" && packet.media_id.startsWith("bench_preview_") && typeof packet.filename === "string" && packet.filename.endsWith(".jpg") && typeof packet.sha256 === "string" && /^[a-f0-9]{64}$/.test(packet.sha256) && typeof packet.jpeg_base64 === "string" && packet.jpeg_base64.length > 0 && packet.jpeg_base64.length <= Math.ceil(BENCH_X_HANDOFF_MAX_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(packet.jpeg_base64) && typeof packet.expires_at === "number" && packet.expires_at > Date.now();
}

export function encodeBenchXHandoffBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function decodeBenchXHandoffBytes(value: string): Uint8Array | null {
  if (!value || value.length > Math.ceil(BENCH_X_HANDOFF_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    if (!binary.length || binary.length > BENCH_X_HANDOFF_MAX_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}
