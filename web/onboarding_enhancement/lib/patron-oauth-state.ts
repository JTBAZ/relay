export function encodePatronOAuthState(state: {
  creator_id: string;
  patreon_campaign_numeric_id: string;
}): string {
  return btoa(JSON.stringify(state));
}
