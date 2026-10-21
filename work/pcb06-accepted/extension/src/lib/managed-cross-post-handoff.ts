import { RELAY_API_BASE } from "./constants";
import { encodeBenchXHandoffBytes } from "./bench-x-handoff";

export const MANAGED_CROSS_POST_HANDOFF_PACKET_KEY = "__relayManagedCrossPostHandoffPacket" as const;
export const MANAGED_HANDOFF_MAX_BYTES = 1024 * 1024;
const PACKET_TTL_MS = 60_000;

type ManagedCrossPostHandoffCommon = {
  version: 1;
  attempt_id: string;
  relay_post_id: string;
  media_id: string;
  filename: string;
  sha256: string;
  jpeg_base64: string;
  expires_at: number;
};

export type ManagedCrossPostHandoffPacket =
  | (ManagedCrossPostHandoffCommon & { destination: "x"; post_text: string })
  | (ManagedCrossPostHandoffCommon & { destination: "deviantart"; title: string; body_text: string; tags: string[] });

export type ManagedAttemptMessage = { relay_post_id: string; destination: "x" | "deviantart"; distribution_attempt_id: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

async function readBytes(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MANAGED_HANDOFF_MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  if (size < 3) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? bytes : null;
}

/** Validates a server-owned attempt envelope and binds its exact copy and JPEG to one tab. */
export async function createManagedCrossPostHandoffPacket(input: {
  data: unknown;
  message: ManagedAttemptMessage;
  token: string;
  fetcher?: typeof fetch;
}): Promise<{ packet: ManagedCrossPostHandoffPacket } | { revoked: true } | null> {
  const data = input.data;
  if (!record(data) || data.attempt_id !== input.message.distribution_attempt_id || data.destination !== input.message.destination || !record(data.managed_handoff_v1) || !record(data.package)) return null;
  const authority = data.managed_handoff_v1;
  const authorityKeys = ["attempt_id", "post_id", "destination", "variant_id", "revision", "task_id", "scheduled_for", "copy_hash", "export_hash"];
  if (!exact(authority, authorityKeys) || authority.attempt_id !== input.message.distribution_attempt_id || authority.post_id !== input.message.relay_post_id || authority.destination !== input.message.destination || typeof authority.variant_id !== "string" || !Number.isSafeInteger(authority.revision) || typeof authority.task_id !== "string" || typeof authority.scheduled_for !== "string" || typeof authority.copy_hash !== "string" || !/^[a-f0-9]{64}$/.test(authority.copy_hash) || typeof authority.export_hash !== "string" || !/^[a-f0-9]{64}$/.test(authority.export_hash)) return null;
  const pkg = data.package;
  if (!record(pkg) || pkg.relay_post_id !== input.message.relay_post_id || !Array.isArray(pkg.media) || pkg.media.length !== 1 || !record(pkg.media[0])) return null;
  const media = pkg.media[0];
  if (!exact(media, ["media_id", "filename", "mime_type", "content_url", "sha256"]) || typeof media.media_id !== "string" || typeof media.filename !== "string" || media.mime_type !== "image/jpeg" || typeof media.content_url !== "string" || !media.content_url.startsWith("/api/v1/export/media/") || !media.content_url.endsWith(`/${encodeURIComponent(media.media_id)}/content`) || media.sha256 !== authority.export_hash) return null;

  let copy: Record<string, unknown>;
  if (input.message.destination === "x") {
    if (!exact(pkg, ["relay_post_id", "title", "body_text", "post_text", "media"]) || typeof pkg.title !== "string" || typeof pkg.body_text !== "string" || pkg.body_text !== "" || typeof pkg.post_text !== "string" || !pkg.post_text.trim() || pkg.title !== pkg.post_text) return null;
    copy = { postText: pkg.post_text };
  } else {
    if (!exact(pkg, ["relay_post_id", "title", "body_text", "tags", "media"]) || typeof pkg.title !== "string" || !pkg.title.trim() || typeof pkg.body_text !== "string" || !pkg.body_text.trim() || !Array.isArray(pkg.tags) || pkg.tags.length > 30 || !pkg.tags.every((tag) => typeof tag === "string")) return null;
    copy = { title: pkg.title, bodyText: pkg.body_text, tags: pkg.tags };
  }
  if (await sha256(new TextEncoder().encode(JSON.stringify(canonical(copy)))) !== authority.copy_hash) return null;

  let response: Response;
  try { response = await (input.fetcher ?? fetch)(`${RELAY_API_BASE}${media.content_url}`, { method: "GET", cache: "no-store", headers: { Accept: "image/jpeg", Authorization: `Bearer ${input.token}` } }); }
  catch { return null; }
  if (response.status === 401) return { revoked: true };
  if (!response.ok || response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "image/jpeg") return null;
  const bytes = await readBytes(response);
  if (!bytes || await sha256(bytes) !== authority.export_hash) return null;
  const common = { version: 1 as const, attempt_id: input.message.distribution_attempt_id, relay_post_id: input.message.relay_post_id, media_id: media.media_id, filename: media.filename, sha256: authority.export_hash, jpeg_base64: encodeBenchXHandoffBytes(bytes), expires_at: Date.now() + PACKET_TTL_MS };
  const packet: ManagedCrossPostHandoffPacket = input.message.destination === "x"
    ? { ...common, destination: "x", post_text: copy.postText as string }
    : { ...common, destination: "deviantart", title: copy.title as string, body_text: copy.bodyText as string, tags: [...copy.tags as string[]] };
  return { packet };
}

export function isManagedCrossPostHandoffPacket(value: unknown, now = Date.now()): value is ManagedCrossPostHandoffPacket {
  if (!record(value)) return false;
  const common = ["version", "attempt_id", "relay_post_id", "destination", "media_id", "filename", "sha256", "jpeg_base64", "expires_at"];
  const fields = value.destination === "x" ? ["post_text"] : value.destination === "deviantart" ? ["title", "body_text", "tags"] : [];
  if (!fields.length || !exact(value, [...common, ...fields]) || value.version !== 1 || typeof value.attempt_id !== "string" || !value.attempt_id.trim() || typeof value.relay_post_id !== "string" || !value.relay_post_id.trim() || typeof value.media_id !== "string" || !value.media_id.trim() || typeof value.filename !== "string" || !value.filename.toLowerCase().endsWith(".jpg") || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.jpeg_base64 !== "string" || value.jpeg_base64.length === 0 || value.jpeg_base64.length > Math.ceil(MANAGED_HANDOFF_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.jpeg_base64) || typeof value.expires_at !== "number" || value.expires_at <= now) return false;
  if (value.destination === "x") return typeof value.post_text === "string" && !!value.post_text.trim() && value.post_text.length <= 280;
  return typeof value.title === "string" && !!value.title.trim() && typeof value.body_text === "string" && !!value.body_text.trim() && Array.isArray(value.tags) && value.tags.length <= 30 && value.tags.every((tag) => typeof tag === "string");
}

export function decodeManagedHandoffJpeg(value: string): Uint8Array | null {
  if (!value || value.length > Math.ceil(MANAGED_HANDOFF_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    if (binary.length < 3 || binary.length > MANAGED_HANDOFF_MAX_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? bytes : null;
  } catch { return null; }
}
