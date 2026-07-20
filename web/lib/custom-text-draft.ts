import {
  patchDistributionVariant,
  type DistributionDestination,
  type DistributionPlanWire,
} from "@/lib/relay-api";

export type CustomTextDraft = {
  title: string;
  body: string;
  tags: string;
};

export type CustomTextDraftsByDestination = Partial<
  Record<DistributionDestination, CustomTextDraft>
>;

export type CustomTextFieldConfig = {
  showTitle: boolean;
  titleDisabled: boolean;
  titleTooltip?: string;
  showDescription: boolean;
  showTags: boolean;
  characterLimit: number | null;
};

export function customTextFieldConfig(dest: DistributionDestination): CustomTextFieldConfig {
  if (dest === "x") {
    return {
      showTitle: true,
      titleDisabled: true,
      titleTooltip: "X doesn't use a title — your copy goes in Description.",
      showDescription: true,
      showTags: true,
      characterLimit: 280,
    };
  }
  if (dest === "bluesky") {
    return {
      showTitle: false,
      titleDisabled: true,
      showDescription: true,
      showTags: false,
      characterLimit: 300,
    };
  }
  if (dest === "deviantart") {
    return {
      showTitle: true,
      titleDisabled: false,
      showDescription: true,
      showTags: true,
      characterLimit: null,
    };
  }
  return {
    showTitle: true,
    titleDisabled: false,
    showDescription: true,
    showTags: true,
    characterLimit: null,
  };
}

function parseDraftTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function draftToPatchPayload(
  dest: DistributionDestination,
  draft: CustomTextDraft
): Partial<{
  title: string | null;
  body_text: string | null;
  post_text: string | null;
  tags: string[];
}> {
  const tags = parseDraftTags(draft.tags);
  const body = draft.body.trim() || null;
  const title = draft.title.trim() || null;

  if (dest === "x") {
    return { body_text: body, tags };
  }
  if (dest === "bluesky") {
    return { post_text: body };
  }
  if (dest === "deviantart") {
    return { title, body_text: body, tags };
  }
  return { title, body_text: body };
}

export async function applyCustomTextDrafts(
  plan: DistributionPlanWire,
  drafts: CustomTextDraftsByDestination
): Promise<DistributionPlanWire> {
  const entries = Object.entries(drafts).filter(
    (entry): entry is [DistributionDestination, CustomTextDraft] => Boolean(entry[1])
  );
  if (entries.length === 0) return plan;

  const updatedVariants = [...plan.variants];

  for (const [dest, draft] of entries) {
    const variant = plan.variants.find((v) => v.destination === dest);
    if (!variant) continue;

    const { variant: saved } = await patchDistributionVariant(
      variant.variant_id,
      draftToPatchPayload(dest, draft)
    );
    const idx = updatedVariants.findIndex((v) => v.variant_id === saved.variant_id);
    if (idx >= 0) {
      updatedVariants[idx] = saved;
    }
  }

  return { ...plan, variants: updatedVariants };
}
