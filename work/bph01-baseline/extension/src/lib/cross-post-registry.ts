import { DEVIANTART_SUBMIT_URL, PATREON_NEW_POST_URL, X_COMPOSE_URL } from "./constants";
import {
  FILL_DEVIANTART_SUBMIT_SCRIPT,
  FILL_PATREON_EDITOR_SCRIPT,
  FILL_X_COMPOSE_SCRIPT
} from "./cross-post-inject";
import {
  parseDeviantArtCrossPostPackage,
  parsePatreonCrossPostPackage,
  parseXCrossPostPackage,
  type CrossPostDestination,
  type PendingCrossPostPackage
} from "./cross-post-types";

export type CrossPostPlatformConfig = {
  destination: CrossPostDestination;
  apiSegment: string;
  composeUrl: string;
  fillScript: string;
  isTabUrl: (url: string | undefined) => boolean;
  parsePackage: (raw: unknown) => PendingCrossPostPackage;
};

function isPatreonTabUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "www.patreon.com" || host.endsWith(".patreon.com");
  } catch {
    return false;
  }
}

function isXTabUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com");
  } catch {
    return false;
  }
}

function isDeviantArtTabUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "www.deviantart.com" || host.endsWith(".deviantart.com");
  } catch {
    return false;
  }
}

export const CROSS_POST_PLATFORMS: Record<CrossPostDestination, CrossPostPlatformConfig> = {
  patreon: {
    destination: "patreon",
    apiSegment: "patreon",
    composeUrl: PATREON_NEW_POST_URL,
    fillScript: FILL_PATREON_EDITOR_SCRIPT,
    isTabUrl: isPatreonTabUrl,
    parsePackage: parsePatreonCrossPostPackage
  },
  x: {
    destination: "x",
    apiSegment: "x",
    composeUrl: X_COMPOSE_URL,
    fillScript: FILL_X_COMPOSE_SCRIPT,
    isTabUrl: isXTabUrl,
    parsePackage: parseXCrossPostPackage
  },
  deviantart: {
    destination: "deviantart",
    apiSegment: "deviantart",
    composeUrl: DEVIANTART_SUBMIT_URL,
    fillScript: FILL_DEVIANTART_SUBMIT_SCRIPT,
    isTabUrl: isDeviantArtTabUrl,
    parsePackage: parseDeviantArtCrossPostPackage
  }
};

export function getCrossPostPlatform(destination: CrossPostDestination): CrossPostPlatformConfig {
  return CROSS_POST_PLATFORMS[destination];
}
