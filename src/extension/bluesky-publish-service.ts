/**
 * Bluesky cross-post via ATProto HTTP API (text-first; images deferred).
 */
import type { PrismaClient } from "@prisma/client";
import type { TokenEncryption } from "../lib/crypto.js";
import { buildRelayCrossPostPackage, formatBlueskyPostText } from "./cross-post-package.js";
import { loadCreatorBlueskyAppPassword } from "./bluesky-credential-service.js";

const BSKY_API = "https://bsky.social/xrpc";

export type BlueskyPublishResult =
  | { status: "no_primary_creator" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "not_connected" }
  | { status: "publish_failed"; detail: string }
  | { status: "ok"; uri: string; cid: string; post_text: string };

type BskySession = {
  did: string;
  accessJwt: string;
};

async function createBskySession(handle: string, appPassword: string): Promise<BskySession> {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bluesky session failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { did?: string; accessJwt?: string };
  if (!json.did?.trim() || !json.accessJwt?.trim()) {
    throw new Error("Bluesky session response missing tokens.");
  }
  return { did: json.did.trim(), accessJwt: json.accessJwt.trim() };
}

async function createBskyPost(session: BskySession, text: string): Promise<{ uri: string; cid: string }> {
  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString()
      }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bluesky publish failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { uri?: string; cid?: string };
  if (!json.uri?.trim() || !json.cid?.trim()) {
    throw new Error("Bluesky publish response missing uri/cid.");
  }
  return { uri: json.uri.trim(), cid: json.cid.trim() };
}

export async function publishRelayPostToBluesky(
  prisma: PrismaClient,
  encryption: TokenEncryption,
  input: { postId: string; accountId: string }
): Promise<BlueskyPublishResult> {
  const pkgResult = await buildRelayCrossPostPackage(prisma, {
    postId: input.postId,
    accountId: input.accountId
  });
  if (pkgResult.status !== "ok") {
    return pkgResult;
  }

  const account = await prisma.account.findUnique({
    where: { id: input.accountId.trim() },
    select: { primaryRelayCreatorId: true }
  });
  const creatorId = account?.primaryRelayCreatorId?.trim() ?? "";
  if (!creatorId) {
    return { status: "no_primary_creator" };
  }

  const creds = await loadCreatorBlueskyAppPassword(prisma, encryption, creatorId);
  if (!creds) {
    return { status: "not_connected" };
  }

  const postText = formatBlueskyPostText(pkgResult.package.title, pkgResult.package.body_text);
  if (!postText.trim()) {
    return { status: "publish_failed", detail: "Post has no text to publish." };
  }

  try {
    const session = await createBskySession(creds.handle, creds.appPassword);
    const published = await createBskyPost(session, postText);
    return {
      status: "ok",
      uri: published.uri,
      cid: published.cid,
      post_text: postText
    };
  } catch (err) {
    return {
      status: "publish_failed",
      detail: err instanceof Error ? err.message : String(err)
    };
  }
}
