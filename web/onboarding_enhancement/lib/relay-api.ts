// Stub — replace with real implementation
export const RELAY_CREATOR_ID_STORAGE_KEY = "relay_creator_id";
export const RELAY_PUBLIC_SLUG_STORAGE_KEY = "relay_public_slug";

export class RelayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayApiError";
  }
}

export async function postCreatorWorkspace(): Promise<{ relay_creator_id: string }> {
  return { relay_creator_id: "demo_creator" };
}

export async function postPatreonCreatorPrepare(_creatorId: string): Promise<{ state: string }> {
  return { state: "demo_state" };
}

export function buildPatreonCreatorAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  return `https://www.patreon.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;
}

export function hasRelaySignedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("relay_signed_in=1");
}
