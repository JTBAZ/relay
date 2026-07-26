/**
 * Shared mock Main/Preview media pair for distribution media-substitute tests.
 * Fixture PNGs: tests/fixtures/distribution-media-pair/{main,preview}.png
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  MediaUpstreamStatus,
  PostSource,
  PostUpstreamStatus
} from "@prisma/client";

export const DISTRIBUTION_MEDIA_PAIR_CREATOR_ID = "cr_dist_pkg";
export const DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID = "acc_dist_pkg";
export const DISTRIBUTION_MEDIA_PAIR_MEMBERSHIP_ID = "tm_dist_pkg";
export const DISTRIBUTION_MEDIA_PAIR_POST_ID = "relay_post_dist_pkg";
export const DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON = "pda_patreon";
export const DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X = "pda_x";
export const DISTRIBUTION_MEDIA_MAIN_MOCK_ID = "rel_media_dist_main_mock";
export const DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID = "rel_media_dist_preview_mock";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/distribution-media-pair");

export const distributionMediaPairFixturePaths = {
  main: join(fixtureDir, "main.png"),
  preview: join(fixtureDir, "preview.png")
} as const;

export type DistributionMediaPairStubState = {
  accounts: Array<{ id: string; primaryRelayCreatorId: string | null }>;
  memberships: Array<{ id: string; accountId: string }>;
  posts: Array<{
    id: string;
    creatorId: string;
    source: PostSource;
    upstreamStatus: PostUpstreamStatus;
    versions: Array<{
      versionSeq: number;
      title: string;
      description: string | null;
      mediaIds: string[];
    }>;
    presentation: null;
  }>;
  media: Array<{
    id: string;
    creatorId: string;
    currentMimeType: string | null;
    upstreamStatus: MediaUpstreamStatus;
  }>;
  attempts: Array<{
    id: string;
    creatorId: string;
    postId: string;
    destination: string;
    variantId: string;
    status: string;
    extensionTabId: number | null;
    fillResult: Record<string, unknown>;
    externalUrl: string | null;
    externalId: string | null;
    errorCode: string | null;
    errorDetail: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }>;
  variants: Array<{
    id: string;
    planId: string;
    postId: string;
    creatorId: string;
    destination: string;
    status: string;
    assistantEnabled: boolean;
    title: string | null;
    bodyText: string | null;
    postText: string | null;
    tags: string[];
    locale: string | null;
    scheduledFor: Date | null;
    remindMe: boolean;
    reminderSentAt: Date | null;
    platformFields: Record<string, unknown>;
    advice: Record<string, unknown>;
    approvedAt: Date | null;
  }>;
  plans: Array<{
    id: string;
    assistantPlan: Record<string, unknown>;
  }>;
};

export function distributionMediaPairBaseState(): DistributionMediaPairStubState {
  const planId = "plan_dist_1";
  return {
    accounts: [
      {
        id: DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID,
        primaryRelayCreatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID
      }
    ],
    memberships: [
      {
        id: DISTRIBUTION_MEDIA_PAIR_MEMBERSHIP_ID,
        accountId: DISTRIBUTION_MEDIA_PAIR_ACCOUNT_ID
      }
    ],
    posts: [
      {
        id: DISTRIBUTION_MEDIA_PAIR_POST_ID,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        source: PostSource.RELAY,
        upstreamStatus: PostUpstreamStatus.active,
        versions: [
          {
            versionSeq: 1,
            title: "Orb piece",
            description: "Test body",
            mediaIds: [DISTRIBUTION_MEDIA_MAIN_MOCK_ID]
          }
        ],
        presentation: null
      }
    ],
    media: [
      {
        id: DISTRIBUTION_MEDIA_MAIN_MOCK_ID,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        currentMimeType: "image/png",
        upstreamStatus: MediaUpstreamStatus.active
      },
      {
        id: DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        currentMimeType: "image/png",
        upstreamStatus: MediaUpstreamStatus.active
      }
    ],
    plans: [
      {
        id: planId,
        assistantPlan: {
          needs_preview: true,
          preview_media_id: DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID,
          media_routing_by_destination: { patreon: "full", x: "preview" }
        }
      }
    ],
    variants: [
      {
        id: "var_patreon",
        planId,
        postId: DISTRIBUTION_MEDIA_PAIR_POST_ID,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        destination: "patreon",
        status: "approved",
        assistantEnabled: false,
        title: null,
        bodyText: null,
        postText: null,
        tags: [],
        locale: null,
        scheduledFor: null,
        remindMe: false,
        reminderSentAt: null,
        platformFields: { media_version: "full" },
        advice: {},
        approvedAt: new Date()
      },
      {
        id: "var_x",
        planId,
        postId: DISTRIBUTION_MEDIA_PAIR_POST_ID,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        destination: "x",
        status: "approved",
        assistantEnabled: false,
        title: null,
        bodyText: "Tweet body",
        postText: "Tweet body",
        tags: [],
        locale: null,
        scheduledFor: null,
        remindMe: false,
        reminderSentAt: null,
        platformFields: { media_version: "preview", analytics_content_role: "promo" },
        advice: {},
        approvedAt: new Date()
      }
    ],
    attempts: [
      {
        id: DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        postId: DISTRIBUTION_MEDIA_PAIR_POST_ID,
        destination: "patreon",
        variantId: "var_patreon",
        status: "started",
        extensionTabId: null,
        fillResult: {},
        externalUrl: null,
        externalId: null,
        errorCode: null,
        errorDetail: null,
        startedAt: new Date(),
        completedAt: null
      },
      {
        id: DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X,
        creatorId: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
        postId: DISTRIBUTION_MEDIA_PAIR_POST_ID,
        destination: "x",
        variantId: "var_x",
        status: "started",
        extensionTabId: null,
        fillResult: {},
        externalUrl: null,
        externalId: null,
        errorCode: null,
        errorDetail: null,
        startedAt: new Date(),
        completedAt: null
      }
    ]
  };
}

export function distributionMediaPairPrismaStub(
  state: DistributionMediaPairStubState,
  options?: { attemptUpdate?: ReturnType<typeof vi.fn> }
): PrismaClient {
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const membershipsById = new Map(state.memberships.map((m) => [m.id, m]));
  const postsById = new Map(state.posts.map((p) => [p.id, p]));
  const mediaById = new Map(state.media.map((m) => [m.id, m]));
  const attemptsById = new Map(state.attempts.map((a) => [a.id, a]));
  const variantsById = new Map(state.variants.map((v) => [v.id, v]));
  const plansById = new Map(state.plans.map((p) => [p.id, p]));
  const attemptUpdate = options?.attemptUpdate ?? vi.fn().mockResolvedValue({});

  return {
    account: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: { primaryRelayCreatorId?: boolean } }) => {
        const row = accountsById.get(args.where.id);
        if (!row) return null;
        if (args.select?.primaryRelayCreatorId) {
          return { primaryRelayCreatorId: row.primaryRelayCreatorId };
        }
        return row;
      })
    },
    tenantMembership: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: { accountId?: boolean } }) => {
        const row = membershipsById.get(args.where.id);
        if (!row) return null;
        if (args.select?.accountId) {
          return { accountId: row.accountId };
        }
        return row;
      })
    },
    post: {
      findFirst: vi.fn(async (args: { where: { id: string; source: PostSource; upstreamStatus: PostUpstreamStatus } }) => {
        const post = postsById.get(args.where.id);
        if (!post) return null;
        if (post.source !== args.where.source || post.upstreamStatus !== args.where.upstreamStatus) {
          return null;
        }
        const versions = [...post.versions].sort((a, b) => b.versionSeq - a.versionSeq);
        return { ...post, versions: versions.slice(0, 1), presentation: post.presentation };
      })
    },
    mediaAsset: {
      findMany: vi.fn(
        async (args: {
          where: { id: { in: string[] }; creatorId: string; upstreamStatus: MediaUpstreamStatus };
        }) => {
          return args.where.id.in
            .map((id) => mediaById.get(id))
            .filter((row): row is (typeof state.media)[number] => {
              if (!row) return false;
              return (
                row.creatorId === args.where.creatorId &&
                row.upstreamStatus === args.where.upstreamStatus
              );
            })
            .map((row) => ({ id: row.id, currentMimeType: row.currentMimeType }));
        }
      )
    },
    postDistributionAttempt: {
      findFirst: vi.fn(async (args: { where: { id: string; creatorId: string }; include?: unknown }) => {
        const attempt = attemptsById.get(args.where.id);
        if (!attempt || attempt.creatorId !== args.where.creatorId) return null;
        const variant = variantsById.get(attempt.variantId);
        if (!variant) return null;
        const plan = plansById.get(variant.planId);
        return {
          ...attempt,
          variant: {
            ...variant,
            plan: { assistantPlan: plan?.assistantPlan ?? {} },
            attempts: [attempt],
            postbotTasks: []
          }
        };
      }),
      update: attemptUpdate
    }
  } as unknown as PrismaClient;
}
