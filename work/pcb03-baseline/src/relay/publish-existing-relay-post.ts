/**
 * In-place publish for an existing draft Relay post (Schedule Rail / Goal Cycle).
 * Does not create a second Post — flips publishState and stamps publishedAt.
 */
import {
  PostPublishState,
  PostSource,
  type PrismaClient
} from "@prisma/client";
import { emitPostPublishedEvent } from "../patron/notification-event-emit.js";
import { reconcilePostingGoalNudgesAfterPublish } from "../autopost/posting-goal-service.js";
import { sanitizeOptionalPostDescriptionHtml } from "../security/sanitize-post-html.js";
import {
  RelayCreatePostError,
  resolveRelayPostTier
} from "./create-relay-post.js";
import { updatePostAudienceTierGate } from "./update-post-audience-tier-gate.js";

export type PublishExistingRelayPostInput = {
  creatorId: string;
  postId: string;
  isPublic: boolean;
  /** Prisma Tier.id or relayTierId keys (same as create / audience-access). */
  tierIds?: string[];
  title?: string | null;
  description?: string | null;
  tags?: string[];
  publishedAt?: Date | null;
};

export type PublishExistingRelayPostResult = {
  post_id: string;
  publish_state: "published";
  published_at: string;
  is_public: boolean;
  tier_ids: string[];
};

export class PublishExistingRelayPostError extends Error {
  public override readonly name = "PublishExistingRelayPostError";
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

/**
 * Publish an existing creator-owned draft Relay post in place.
 * @throws {PublishExistingRelayPostError}
 */
export async function publishExistingRelayPost(
  prisma: PrismaClient,
  input: PublishExistingRelayPostInput
): Promise<PublishExistingRelayPostResult> {
  const creatorId = input.creatorId.trim();
  const postId = input.postId.trim();
  if (!creatorId || !postId) {
    throw new PublishExistingRelayPostError(
      "VALIDATION_ERROR",
      "creatorId and postId are required.",
      400
    );
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId },
    select: {
      id: true,
      source: true,
      publishState: true,
      campaignId: true
    }
  });
  if (!post) {
    throw new PublishExistingRelayPostError("NOT_FOUND", "Post not found.", 404);
  }
  if (post.source !== PostSource.RELAY) {
    throw new PublishExistingRelayPostError(
      "VALIDATION_ERROR",
      "Only Relay-native posts can be published through this path.",
      400
    );
  }
  if (post.publishState === PostPublishState.published) {
    throw new PublishExistingRelayPostError(
      "ALREADY_PUBLISHED",
      "This Relay post is already published.",
      409
    );
  }
  if (post.publishState !== PostPublishState.draft) {
    throw new PublishExistingRelayPostError(
      "VALIDATION_ERROR",
      `Cannot publish post in state: ${post.publishState}`,
      400
    );
  }

  const isPublic = input.isPublic === true;
  const tierKeys = [...new Set((input.tierIds ?? []).map((t) => t.trim()).filter(Boolean))];
  if (!isPublic && tierKeys.length === 0) {
    throw new PublishExistingRelayPostError(
      "VALIDATION_ERROR",
      "Select at least one tier, or make the post public.",
      400
    );
  }

  const versionTierRelayIds: string[] = [];
  if (!isPublic) {
    if (!post.campaignId) {
      throw new PublishExistingRelayPostError(
        "VALIDATION_ERROR",
        "Post has no campaign; cannot resolve tier access.",
        400
      );
    }
    try {
      for (const key of tierKeys) {
        const resolved = await resolveRelayPostTier(
          prisma,
          creatorId,
          key,
          post.campaignId
        );
        versionTierRelayIds.push(resolved.relayTierId);
      }
    } catch (err) {
      if (err instanceof RelayCreatePostError) {
        throw new PublishExistingRelayPostError(err.code, err.message, err.statusCode);
      }
      throw err;
    }
  }
  const uniqueRelayTierIds = [...new Set(versionTierRelayIds)];
  const effectivePublic = isPublic || uniqueRelayTierIds.length === 0;

  const version = await prisma.postVersion.findFirst({
    where: { postId, post: { creatorId } },
    orderBy: { versionSeq: "desc" },
    select: {
      id: true,
      versionSeq: true,
      title: true,
      description: true,
      tagIds: true
    }
  });
  if (!version) {
    throw new PublishExistingRelayPostError(
      "NOT_FOUND",
      "Post version not found.",
      404
    );
  }

  const publishedAt =
    input.publishedAt && !Number.isNaN(input.publishedAt.getTime())
      ? input.publishedAt
      : new Date();

  const nextTitle =
    input.title !== undefined
      ? (input.title?.trim() || version.title).slice(0, 200)
      : version.title;
  const nextDescription =
    input.description !== undefined
      ? sanitizeOptionalPostDescriptionHtml(input.description?.trim() ?? null)
      : version.description;
  const nextTags =
    input.tags !== undefined
      ? [
          ...new Set(
            input.tags
              .map((t) => String(t ?? "").trim().replace(/^#/, ""))
              .filter(Boolean)
          )
        ].slice(0, 20)
      : version.tagIds;

  // Audience gate first (isPublic / PostTier / version.tierIds), then stamp publish.
  await updatePostAudienceTierGate(prisma, {
    creatorId,
    postId,
    tierIds: uniqueRelayTierIds,
    isPublic: effectivePublic
  });

  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: { publishState: PostPublishState.published }
    });
    await tx.postVersion.update({
      where: {
        postId_versionSeq: { postId, versionSeq: version.versionSeq }
      },
      data: {
        publishedAt,
        title: nextTitle,
        description: nextDescription,
        tagIds: nextTags,
        tierIds: uniqueRelayTierIds
      }
    });
  });

  try {
    await emitPostPublishedEvent(prisma, {
      postId,
      relayCreatorId: creatorId,
      title: nextTitle,
      publishedAt
    });
  } catch {
    /* notification emit must not fail publish */
  }
  try {
    await reconcilePostingGoalNudgesAfterPublish(prisma, creatorId);
  } catch {
    /* nudge reconcile must not fail publish */
  }

  return {
    post_id: postId,
    publish_state: "published",
    published_at: publishedAt.toISOString(),
    is_public: effectivePublic,
    tier_ids: uniqueRelayTierIds
  };
}
