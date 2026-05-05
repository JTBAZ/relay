import { relayDiscordSignatureHeader } from "./hmac.js";

export type BindBody = {
  code: string;
  discord_guild_id: string;
  discord_channel_id: string;
};

export type IngestAttachment = {
  id: string;
  url: string;
  content_type?: string | null;
  byte_size?: number | null;
};

export type IngestBody = {
  discord_guild_id: string;
  discord_channel_id: string;
  discord_message_id: string;
  message_content?: string | null;
  message_timestamp?: string | null;
  attachments: IngestAttachment[];
};

type EnvelopeError = { error?: { message?: string; code?: string } };
type EnvelopeOk<T> = { data?: T };

function messageFromJson(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const e = json as EnvelopeError;
  return e.error?.message || fallback;
}

export async function postDiscordRelaySignedJson<T = unknown>(args: {
  apiBase: string;
  path: string;
  body: unknown;
  hmacSecret: string;
}): Promise<{ ok: boolean; status: number; json: unknown; data?: T }> {
  const raw = JSON.stringify(args.body);
  const sig = relayDiscordSignatureHeader(raw, args.hmacSecret);
  const url = `${args.apiBase}${args.path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-relay-discord-signature": sig
    },
    body: raw
  });
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { parse_error: text.slice(0, 500) };
    }
  }
  const ok = res.ok;
  const data =
    json && typeof json === "object" && "data" in json
      ? (json as EnvelopeOk<T>).data
      : undefined;
  return { ok, status: res.status, json, data };
}

export async function relayBind(args: {
  apiBase: string;
  hmacSecret: string;
  payload: BindBody;
}): Promise<{ ok: boolean; status: number; message: string }> {
  const out = await postDiscordRelaySignedJson<{ relay_creator_id: string }>({
    apiBase: args.apiBase,
    path: "/api/v1/internal/discord/bind",
    body: args.payload,
    hmacSecret: args.hmacSecret
  });
  const message = out.ok
    ? "Channel linked to your Relay studio."
    : messageFromJson(out.json, `Bind failed (HTTP ${out.status}).`);
  return { ok: out.ok, status: out.status, message };
}

export async function relayIngest(args: {
  apiBase: string;
  hmacSecret: string;
  payload: IngestBody;
}): Promise<{ ok: boolean; status: number; message: string }> {
  const out = await postDiscordRelaySignedJson({
    apiBase: args.apiBase,
    path: "/api/v1/internal/discord/ingest",
    body: args.payload,
    hmacSecret: args.hmacSecret
  });
  const message = out.ok
    ? "ok"
    : messageFromJson(out.json, `Ingest failed (HTTP ${out.status}).`);
  return { ok: out.ok, status: out.status, message };
}
