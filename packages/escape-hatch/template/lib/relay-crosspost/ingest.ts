/**
 * Inbound Relay Crosspost ingest into site.json (EH-064).
 */

import type { AccessLevel } from "../contracts";
import { upsertPost, type UpsertPostInput } from "../cms/posts";
import { markPostCrossposted } from "../patreon/sync-state";
import type { AuthenticatedCrosspostToken } from "./tokens";
import { tokenHasScope } from "./tokens";
import {
  appendCrosspostAudit,
  findIdempotentResponse,
  storeIdempotentResponse
} from "./audit";

export type CrosspostIngestInput = {
  siteId: string;
  token: AuthenticatedCrosspostToken;
  action: "draft" | "publish";
  title: string;
  body_plain?: string | null;
  access_level?: AccessLevel;
  tier_ids?: string[];
  slug?: string;
  upstream_id: string;
  upstream_revision?: string | null;
  idempotency_key?: string | null;
  kitDir?: string;
};

export type CrosspostIngestResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

/**
 * Create or update a Crosspost-originated post. Never elevates to admin.
 */
export function ingestCrosspostPost(
  input: CrosspostIngestInput
): CrosspostIngestResult {
  const kitDir = input.kitDir ?? process.cwd();
  const needed =
    input.action === "publish" ? "crosspost:publish" : "crosspost:draft";
  if (!tokenHasScope(input.token, needed)) {
    const body = {
      ok: false,
      error: "insufficient_scope",
      needed,
      production_safe: false
    };
    appendCrosspostAudit(
      input.siteId,
      {
        token_id: input.token.token_id,
        action: input.action,
        post_id: null,
        idempotency_key: input.idempotency_key ?? null,
        ok: false,
        detail: "insufficient_scope"
      },
      kitDir
    );
    return { ok: false, status: 403, body };
  }

  const idemKey = input.idempotency_key?.trim() || null;
  if (idemKey) {
    const prior = findIdempotentResponse(
      input.siteId,
      input.token.token_id,
      idemKey,
      kitDir
    );
    if (prior) {
      return {
        ok: prior.response_status < 400,
        status: prior.response_status,
        body: prior.response_body as Record<string, unknown>
      };
    }
  }

  const upstream = input.upstream_id?.trim();
  if (!upstream) {
    const body = {
      ok: false,
      error: "upstream_id_required",
      production_safe: false
    };
    return { ok: false, status: 400, body };
  }

  const postId = `crosspost_${upstream.replace(/[^\p{L}\p{N}_.-]+/gu, "_").slice(0, 48)}`;
  const level = input.access_level ?? "member_only";
  const upsertInput: UpsertPostInput = {
    post_id: postId,
    title: input.title,
    slug: input.slug,
    access_level: level,
    tier_ids: input.tier_ids,
    status: input.action === "publish" ? "published" : "draft",
    body_plain: input.body_plain ?? null,
    skip_local_edit_mark: true
  };

  const result = upsertPost(upsertInput, kitDir);
  if (!result.ok) {
    const body = {
      ok: false,
      error: result.reason,
      production_safe: false
    };
    appendCrosspostAudit(
      input.siteId,
      {
        token_id: input.token.token_id,
        action: input.action,
        post_id: postId,
        idempotency_key: idemKey,
        ok: false,
        detail: result.reason
      },
      kitDir
    );
    const out = { ok: false, status: 400, body };
    if (idemKey) {
      storeIdempotentResponse(
        input.siteId,
        {
          key: idemKey,
          token_id: input.token.token_id,
          response_status: 400,
          response_body: body,
          created_at: new Date().toISOString()
        },
        kitDir
      );
    }
    return out;
  }

  markPostCrossposted(input.siteId, result.post.post_id, {
    upstream_id: upstream,
    upstream_revision: input.upstream_revision ?? null,
    kitDir
  });

  const body = {
    ok: true,
    created: result.created,
    post: {
      post_id: result.post.post_id,
      slug: result.post.slug,
      title: result.post.title,
      status: result.post.status ?? "published",
      origin: "crossposted"
    },
    production_safe: false
  };
  appendCrosspostAudit(
    input.siteId,
    {
      token_id: input.token.token_id,
      action: input.action,
      post_id: result.post.post_id,
      idempotency_key: idemKey,
      ok: true,
      detail: result.created ? "created" : "updated"
    },
    kitDir
  );
  if (idemKey) {
    storeIdempotentResponse(
      input.siteId,
      {
        key: idemKey,
        token_id: input.token.token_id,
        response_status: 200,
        response_body: body,
        created_at: new Date().toISOString()
      },
      kitDir
    );
  }
  return { ok: true, status: 200, body };
}
