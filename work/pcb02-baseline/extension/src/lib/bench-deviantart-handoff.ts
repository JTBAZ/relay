import type { DeviantArtCrossPostPackage } from "./cross-post-types";
import { BENCH_X_HANDOFF_MAX_BYTES, BENCH_X_HANDOFF_PACKET_TTL_MS, encodeBenchXHandoffBytes } from "./bench-x-handoff";

export const BENCH_DEVIANTART_HANDOFF_PACKET_KEY = "__relayBenchDeviantArtHandoffPacket" as const;
export const BENCH_DEVIANTART_HANDOFF_MAX_BYTES = BENCH_X_HANDOFF_MAX_BYTES;
export const BENCH_DEVIANTART_HANDOFF_PACKET_TTL_MS = BENCH_X_HANDOFF_PACKET_TTL_MS;

export type BenchDeviantArtHandoffPacket = {
  version: 1;
  handoff_id: string;
  relay_post_id: string;
  title: string;
  body_text: string;
  tags: string[];
  media_id: string;
  filename: string;
  sha256: string;
  jpeg_base64: string;
  expires_at: number;
};

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export function parseBenchDeviantArtHandoffEnvelope(raw: unknown, sessionId: string, handoffId: string): { pkg: DeviantArtCrossPostPackage; mediaHash: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = (raw as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const envelope = data as Record<string, unknown>;
  if (Object.keys(envelope).length !== 4 || envelope.session_id !== sessionId || envelope.handoff_id !== handoffId || envelope.destination !== "deviantart" || !envelope.package || typeof envelope.package !== "object" || Array.isArray(envelope.package)) return null;
  const pkg = envelope.package as Record<string, unknown>;
  if (Object.keys(pkg).length !== 5 || typeof pkg.relay_post_id !== "string" || !pkg.relay_post_id.startsWith("bench_handoff_") || typeof pkg.title !== "string" || !pkg.title.trim() || pkg.title.length > 200 || typeof pkg.body_text !== "string" || !Array.isArray(pkg.tags) || pkg.tags.length > 30 || pkg.tags.some(tag => typeof tag !== "string") || !Array.isArray(pkg.media) || pkg.media.length !== 1) return null;
  const item = pkg.media[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const media = item as Record<string, unknown>;
  const expectedUrl = `/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}/deviantart-handoff/${encodeURIComponent(handoffId)}/media/${encodeURIComponent(String(media.media_id ?? ""))}`;
  if (Object.keys(media).length !== 5 || typeof media.media_id !== "string" || !media.media_id.startsWith("bench_preview_") || typeof media.filename !== "string" || !media.filename.endsWith(".jpg") || media.mime_type !== "image/jpeg" || media.content_url !== expectedUrl || typeof media.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(media.sha256)) return null;
  return { pkg: { relay_post_id: pkg.relay_post_id, title: pkg.title, body_text: pkg.body_text, tags: pkg.tags as string[], media: [{ media_id: media.media_id, filename: media.filename, mime_type: "image/jpeg", content_url: media.content_url }] }, mediaHash: media.sha256 };
}

export function createBenchDeviantArtHandoffPacket(input: { handoffId: string; pkg: DeviantArtCrossPostPackage; bytes: Uint8Array; sha256: string; now?: number }): BenchDeviantArtHandoffPacket | null {
  const { handoffId, pkg, bytes, sha256 } = input;
  if (!uuid(handoffId) || bytes.length === 0 || bytes.length > BENCH_DEVIANTART_HANDOFF_MAX_BYTES || !/^[a-f0-9]{64}$/.test(sha256) || !pkg.media[0] || pkg.media.length !== 1) return null;
  return { version: 1, handoff_id: handoffId, relay_post_id: pkg.relay_post_id, title: pkg.title, body_text: pkg.body_text, tags: [...pkg.tags], media_id: pkg.media[0].media_id, filename: pkg.media[0].filename, sha256, jpeg_base64: encodeBenchXHandoffBytes(bytes), expires_at: (input.now ?? Date.now()) + BENCH_DEVIANTART_HANDOFF_PACKET_TTL_MS };
}

export function isBenchDeviantArtHandoffPacket(value: unknown, now = Date.now()): value is BenchDeviantArtHandoffPacket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const packet = value as Record<string, unknown>;
  return Object.keys(packet).length === 11 && packet.version === 1 && uuid(packet.handoff_id) && typeof packet.relay_post_id === "string" && packet.relay_post_id.startsWith("bench_handoff_") && typeof packet.title === "string" && !!packet.title.trim() && packet.title.length <= 200 && typeof packet.body_text === "string" && Array.isArray(packet.tags) && packet.tags.length <= 30 && packet.tags.every(tag => typeof tag === "string") && typeof packet.media_id === "string" && packet.media_id.startsWith("bench_preview_") && typeof packet.filename === "string" && packet.filename.endsWith(".jpg") && typeof packet.sha256 === "string" && /^[a-f0-9]{64}$/.test(packet.sha256) && typeof packet.jpeg_base64 === "string" && packet.jpeg_base64.length > 0 && packet.jpeg_base64.length <= Math.ceil(BENCH_DEVIANTART_HANDOFF_MAX_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(packet.jpeg_base64) && typeof packet.expires_at === "number" && packet.expires_at > now;
}
