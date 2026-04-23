export function resolvePatreonOAuthClientId(): string {
  return process.env.NEXT_PUBLIC_PATREON_CLIENT_ID?.trim() || "";
}
