/**
 * @fileoverview Deterministic platform variant formatting from canonical post copy.
 */

import { formatBlueskyPostText, formatXPostText } from "../extension/cross-post-package.js";
import {
  PLATFORM_DESTINATION_META,
  type DistributionDestination
} from "./platform-destinations.js";

export type CanonicalPostCopy = {
  title: string;
  bodyText: string;
  tagLabels: string[];
};

export type VariantAdvice = {
  warnings?: string[];
  suggested_post_time?: string | null;
  rationale?: string | null;
  /** True when Relay Coach mutated title/body for this variant. */
  coach_edited?: boolean;
};

export type FormattedPlatformVariant = {
  destination: DistributionDestination;
  title: string | null;
  bodyText: string | null;
  postText: string | null;
  tags: string[];
  platformFields: Record<string, unknown>;
  advice: VariantAdvice;
};

export function normalizeDistributionTag(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "_").replace(/[^\w-]/g, "").toLowerCase();
}

export function normalizeDeviantArtTag(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "").replace(/[^\w-]/g, "").toLowerCase();
}

export function normalizeXHashtagTag(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "").replace(/[^\w-]/g, "").toLowerCase();
}

export function normalizeTagsForDestination(
  tags: string[],
  destination: DistributionDestination
): string[] {
  if (destination === "x") {
    return Array.from(new Set(tags.map(normalizeXHashtagTag).filter(Boolean))).map((t) => `#${t}`);
  }
  if (destination === "deviantart") {
    return Array.from(new Set(tags.map(normalizeDeviantArtTag).filter(Boolean))).slice(0, 30);
  }
  const normalized = Array.from(
    new Set(tags.map(normalizeDistributionTag).filter(Boolean))
  );
  return normalized.slice(0, 10);
}

export function buildXPostTextWithTags(title: string, bodyText: string, tags: string[]): string {
  const base = (bodyText.trim() || title.trim()).trim();
  const hashtags = tags.length > 0
    ? Array.from(new Set(tags.map(normalizeXHashtagTag).filter(Boolean))).map((tag) => `#${tag}`)
    : [];
  const tagLine = hashtags.join(" ");
  if (!tagLine) return formatXPostText(title, bodyText, 280);
  const full = base ? `${base}\n\n${tagLine}` : tagLine;
  if (full.length <= 280) return full;
  const reserved = tagLine.length + (base ? 2 : 0);
  if (reserved >= 280) return tagLine.slice(0, 280);
  return `${base.slice(0, 280 - reserved).trimEnd()}\n\n${tagLine}`;
}

export function formatPlatformVariant(
  destination: DistributionDestination,
  canonical: CanonicalPostCopy
): FormattedPlatformVariant {
  const meta = PLATFORM_DESTINATION_META[destination];
  const title = canonical.title.trim() || null;
  const bodyText = canonical.bodyText.trim() || null;
  const tags = normalizeTagsForDestination(canonical.tagLabels, destination);
  const advice: VariantAdvice = { warnings: [] };

  if (destination === "patreon") {
    return {
      destination,
      title,
      bodyText,
      postText: null,
      tags: [],
      platformFields: {},
      advice
    };
  }

  if (destination === "x") {
    const tags = normalizeTagsForDestination(canonical.tagLabels, "x");
    const postText = buildXPostTextWithTags(title ?? "", bodyText ?? "", tags);
    if (postText.length > (meta.characterLimit ?? 280)) {
      advice.warnings?.push(
        `Post text exceeds ${meta.characterLimit} characters (${postText.length}). Shorten before posting.`
      );
    }
    return {
      destination,
      title: null,
      bodyText,
      postText,
      tags,
      platformFields: {},
      advice
    };
  }

  if (destination === "deviantart") {
    return {
      destination,
      title,
      bodyText,
      postText: null,
      tags,
      platformFields: {
        mature: false,
        no_ai: false,
        created_using_ai: false
      },
      advice
    };
  }

  const postText = formatBlueskyPostText(title ?? "", bodyText ?? "", meta.characterLimit ?? 300);
  if (postText.length > (meta.characterLimit ?? 300)) {
    advice.warnings?.push(
      `Post text exceeds ${meta.characterLimit} characters (${postText.length}). Shorten before posting.`
    );
  }
  return {
    destination,
    title: null,
    bodyText: null,
    postText,
    tags: [],
    platformFields: {},
    advice
  };
}

export function formatVariantsForDestinations(
  destinations: DistributionDestination[],
  canonical: CanonicalPostCopy
): FormattedPlatformVariant[] {
  return destinations.map((destination) => formatPlatformVariant(destination, canonical));
}
