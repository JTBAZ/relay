/**
 * Extensible link destinations for Previewizer QR / platform URL lockups.
 * Patreon vanity and Bluesky handle are detected; other platforms are reserved stubs.
 */

import {
  buildBlueskyDisplayText,
  buildBlueskyProfileUrl,
  buildPatreonDisplayText,
  buildPatreonHomepageUrl,
  normalizeExternalHttpsUrl
} from "./previewizer-destination-qr";

export type PreviewizerLinkPlatformId =
  | "patreon"
  | "bluesky"
  | "x"
  | "instagram"
  | "website"
  | "custom";

export type PreviewizerLinkDestination = {
  id: PreviewizerLinkPlatformId;
  label: string;
  href: string;
  displayText: string;
  source: "detected" | "manual";
  available: boolean;
};

export type PreviewizerLinkDestinationInputs = {
  patreonName?: string | null;
  blueskyHandle?: string | null;
  customUrl?: string | null;
};

const STUB_PLATFORMS: Array<{ id: PreviewizerLinkPlatformId; label: string }> = [
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
  { id: "website", label: "Website" }
];

export function assemblePreviewizerLinkDestinations(
  inputs: PreviewizerLinkDestinationInputs
): PreviewizerLinkDestination[] {
  const out: PreviewizerLinkDestination[] = [];

  const vanity = inputs.patreonName?.trim() || "";
  if (vanity) {
    out.push({
      id: "patreon",
      label: "Patreon",
      href: buildPatreonHomepageUrl(vanity),
      displayText: buildPatreonDisplayText(vanity),
      source: "detected",
      available: true
    });
  } else {
    out.push({
      id: "patreon",
      label: "Patreon",
      href: "",
      displayText: "",
      source: "detected",
      available: false
    });
  }

  const bluesky = inputs.blueskyHandle?.trim().replace(/^@+/, "") || "";
  if (bluesky) {
    out.push({
      id: "bluesky",
      label: "Bluesky",
      href: buildBlueskyProfileUrl(bluesky),
      displayText: buildBlueskyDisplayText(bluesky),
      source: "detected",
      available: true
    });
  } else {
    out.push({
      id: "bluesky",
      label: "Bluesky",
      href: "",
      displayText: "",
      source: "detected",
      available: false
    });
  }

  for (const stub of STUB_PLATFORMS) {
    out.push({
      id: stub.id,
      label: stub.label,
      href: "",
      displayText: "",
      source: "detected",
      available: false
    });
  }

  const customHref = normalizeExternalHttpsUrl(inputs.customUrl ?? "") ?? "";
  out.push({
    id: "custom",
    label: "Custom URL",
    href: customHref,
    displayText: (inputs.customUrl ?? "").trim() || customHref,
    source: "manual",
    available: true
  });

  return out;
}

export function defaultPreviewizerDestinationId(
  destinations: ReadonlyArray<PreviewizerLinkDestination>
): PreviewizerLinkPlatformId {
  const patreon = destinations.find((d) => d.id === "patreon" && d.available);
  if (patreon) return "patreon";
  return "custom";
}

export function findPreviewizerDestination(
  destinations: ReadonlyArray<PreviewizerLinkDestination>,
  id: PreviewizerLinkPlatformId
): PreviewizerLinkDestination | undefined {
  return destinations.find((d) => d.id === id);
}

/** Whether this composition can show a destination QR / URL lockup. */
export function compositionSupportsDestinationQr(
  compositionId: string | null | undefined
): boolean {
  return (
    compositionId === "mystery_crop" ||
    compositionId === "cinematic_eyes" ||
    compositionId === "collage_windows" ||
    compositionId === "blur_plug"
  );
}

/**
 * Patch composition props with destination display text
 * (`platformUrl` or blur-plug `handle`).
 */
export function destinationDisplayPatch(
  compositionId: string | null | undefined,
  displayText: string
): Record<string, string> | null {
  if (!compositionId || !displayText.trim()) return null;
  if (compositionId === "blur_plug") return { handle: displayText };
  if (
    compositionId === "mystery_crop" ||
    compositionId === "cinematic_eyes" ||
    compositionId === "collage_windows"
  ) {
    return { platformUrl: displayText };
  }
  return null;
}

