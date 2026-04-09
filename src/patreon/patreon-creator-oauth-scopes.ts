/**
 * Space-separated OAuth scopes for **creator** Patreon authorize (`oauth2/authorize`).
 * Keep in sync with `PATREON_CREATOR_OAUTH_SCOPES` in `web/lib/patreon-creator-scopes.ts`
 * (Next.js dev connect page builds the authorize URL).
 *
 * Mapping to v2 API usage in this repo:
 * - `identity` — creator user / identity as needed for OAuth resources owner
 * - `campaigns` — `GET /v2/campaigns` (campaign + tier metadata)
 * - `campaigns.posts` — `GET /v2/campaigns/{id}/posts`, single post fetch
 * - `campaigns.members` — `GET /v2/campaigns/{id}/members` (member roster / `syncMembers`)
 * - `campaigns.members[email]` — `fields[member]` includes `email` on that endpoint
 * - `w:campaigns.webhook` — create/list/update/delete webhooks via `/api/oauth2/v2/webhooks`
 */
export const PATREON_CREATOR_OAUTH_SCOPES =
  "identity campaigns campaigns.posts campaigns.members campaigns.members[email] w:campaigns.webhook";
