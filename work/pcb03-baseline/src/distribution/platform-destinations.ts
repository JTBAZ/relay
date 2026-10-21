/**
 * @fileoverview Central distribution destination metadata and constraints.
 */

export const DISTRIBUTION_DESTINATIONS = ["patreon", "x", "deviantart", "bluesky"] as const;
export type DistributionDestination = (typeof DISTRIBUTION_DESTINATIONS)[number];

export type HandoffKind = "extension" | "api";

export type PlatformReadiness =
  | "available"
  | "needs_extension"
  | "needs_credential"
  | "disabled"
  | "unsupported";

export type PlatformDestinationMeta = {
  destination: DistributionDestination;
  label: string;
  handoff: HandoffKind;
  characterLimit: number | null;
  mediaLimit: number;
  hashtagStyle: "heavy" | "moderate" | "minimal" | "none";
  requiredFields: Array<"title" | "body_text" | "post_text" | "tags">;
};

export const PLATFORM_DESTINATION_META: Record<DistributionDestination, PlatformDestinationMeta> = {
  patreon: {
    destination: "patreon",
    label: "Patreon",
    handoff: "extension",
    characterLimit: null,
    mediaLimit: 10,
    hashtagStyle: "none",
    requiredFields: ["title", "body_text"]
  },
  x: {
    destination: "x",
    label: "X / Twitter",
    handoff: "extension",
    characterLimit: 280,
    mediaLimit: 4,
    hashtagStyle: "heavy",
    requiredFields: ["post_text"]
  },
  deviantart: {
    destination: "deviantart",
    label: "DeviantArt",
    handoff: "extension",
    characterLimit: null,
    mediaLimit: 1,
    hashtagStyle: "moderate",
    requiredFields: ["title", "body_text", "tags"]
  },
  bluesky: {
    destination: "bluesky",
    label: "Bluesky",
    handoff: "api",
    characterLimit: 300,
    mediaLimit: 0,
    hashtagStyle: "minimal",
    requiredFields: ["post_text"]
  }
};

export function isDistributionDestination(value: string): value is DistributionDestination {
  return (DISTRIBUTION_DESTINATIONS as readonly string[]).includes(value);
}

export function normalizeDistributionDestinations(values: string[]): DistributionDestination[] {
  const out: DistributionDestination[] = [];
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (v === "twitter") {
      if (!out.includes("x")) out.push("x");
      continue;
    }
    if (isDistributionDestination(v) && !out.includes(v)) {
      out.push(v);
    }
  }
  return out;
}
