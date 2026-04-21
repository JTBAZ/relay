/**
 * After session-first `POST /api/v1/auth/patreon/patron/link`, stash
 * `owned_relay_creator_id` + `unmapped_patreon_campaign_ids` for the patron shell
 * (“Connect your Campaign” modal). Session key is one-shot; local snapshot supports Settings re-entry.
 */

export const PATRON_CONNECT_CAMPAIGN_SESSION_KEY = "relay_patreon_connect_prompt_v1";
export const PATRON_CONNECT_CAMPAIGN_LOCAL_KEY = "relay_patreon_connect_last_v1";

export type PatronConnectCampaignPayload = {
  owned_relay_creator_id: string | null;
  unmapped_patreon_campaign_ids: string[];
};

export function shouldPromptConnectCampaign(p: PatronConnectCampaignPayload): boolean {
  const unmapped = p.unmapped_patreon_campaign_ids?.length ?? 0;
  if (unmapped > 0) return true;
  const owned = p.owned_relay_creator_id?.trim();
  return Boolean(owned);
}

/** Call after a successful `/link` response when the user should see the campaign prompt. */
export function stashPatronConnectCampaignPrompt(p: PatronConnectCampaignPayload): void {
  if (typeof window === "undefined") return;
  if (!shouldPromptConnectCampaign(p)) return;
  const json = JSON.stringify(p);
  try {
    sessionStorage.setItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY, json);
    localStorage.setItem(PATRON_CONNECT_CAMPAIGN_LOCAL_KEY, json);
  } catch {
    sessionStorage.setItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY, json);
  }
}

/**
 * One-shot read for post-OAuth redirect: returns payload if present and meaningful, then clears session key.
 */
export function readAndConsumeSessionPatronConnectPrompt(): PatronConnectCampaignPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY);
  try {
    const p = JSON.parse(raw) as PatronConnectCampaignPayload;
    return shouldPromptConnectCampaign(p) ? p : null;
  } catch {
    return null;
  }
}

/** Last known snapshot (Settings → reopen modal). */
export function getSnapshotPatronConnectCampaign(): PatronConnectCampaignPayload | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(PATRON_CONNECT_CAMPAIGN_LOCAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PatronConnectCampaignPayload;
  } catch {
    return null;
  }
}

/** Clear cached “Connect your Campaign” payload (e.g. after Patreon unlink). */
export function clearPatronConnectCampaignStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY);
    localStorage.removeItem(PATRON_CONNECT_CAMPAIGN_LOCAL_KEY);
  } catch {
    sessionStorage.removeItem(PATRON_CONNECT_CAMPAIGN_SESSION_KEY);
  }
}
