import type { Prisma } from "@prisma/client";
import type { FormattedPlatformVariant } from "./platform-formatters.js";

/** Shared Prisma-shaped row data constructors for the existing distribution records. */
export function buildDistributionPlanCreateData(input: {
  creatorId: string;
  postId: string;
  sourceDraftId?: string | null;
  status?: string;
  assistantMode?: string;
  assistantContext?: object;
  assistantPlan?: object;
}): Prisma.PostDistributionPlanUncheckedCreateInput {
  return {
    creatorId: input.creatorId,
    postId: input.postId,
    sourceDraftId: input.sourceDraftId ?? null,
    status: input.status ?? "active",
    assistantMode: input.assistantMode ?? "none",
    assistantContext: input.assistantContext ?? {},
    assistantPlan: input.assistantPlan ?? {},
  };
}

export function buildDistributionVariantCreateData(input: {
  planId: string;
  postId: string;
  creatorId: string;
  variant: FormattedPlatformVariant;
  assistantEnabled?: boolean;
  status?: string;
  platformFields?: Record<string, unknown>;
  advice?: object;
}): Prisma.PostDistributionVariantUncheckedCreateInput {
  const variant = input.variant;
  return {
    planId: input.planId,
    postId: input.postId,
    creatorId: input.creatorId,
    destination: variant.destination,
    status: input.status ?? "draft",
    assistantEnabled: input.assistantEnabled ?? false,
    title: variant.title,
    bodyText: variant.bodyText,
    postText: variant.postText,
    tags: variant.tags,
    platformFields: (input.platformFields ?? variant.platformFields) as Prisma.InputJsonValue,
    advice: (input.advice ?? variant.advice) as Prisma.InputJsonValue,
  };
}
