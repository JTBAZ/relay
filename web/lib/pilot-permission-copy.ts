/**
 * PILOT-004 / PILOT-012 — creator-facing permission model copy (three layers per ADR 004).
 * @see docs/architecture/adr/004-pilot-three-layer-permissions.md
 * @see docs/qa/UX_ACCEPTANCE_GUARDRAILS.md §5
 */

/** Short headline shown wherever Relay visibility and Patreon access could be confused. */
export const PILOT_PERMISSION_HEADLINE = "Relay visibility ≠ Patreon access";

/** Layer C — Relay hide / review / visible in gallery list. */
export const PILOT_PERMISSION_VISIBILITY_HINT =
  "Hiding or maturing a post in Relay only changes gallery presentation. Patreon tier gates still control who can unlock content.";

/** Layer A — audience tier gate (PATCH audience-access). */
export const PILOT_PERMISSION_AUDIENCE_HINT =
  "Audience access sets the Patreon tier gate. It does not change Relay hide/review visibility.";

/** Bulk visibility panel — immediate save, gallery-only. */
export const PILOT_PERMISSION_BULK_VISIBILITY_HINT =
  "Relay gallery only — not Patreon tier access. Patrons still need the right tier when a post is not hidden.";

/** GallerySidebar filter toggles — show/hide rows in the creator library list only. */
export const PILOT_PERMISSION_SIDEBAR_FILTER_HINT =
  "Filters your library view. To hide posts from patrons, select posts and use Relay visibility in the action bar.";

/** Post detail visibility section (read-only chips). */
export const PILOT_PERMISSION_POST_VISIBILITY_HINT =
  "Gallery list visibility in Relay — not Patreon tier access or public page visibility.";

/** Post detail tier section (read-only). */
export const PILOT_PERMISSION_POST_TIER_HINT =
  "Patreon tier access — who is allowed to unlock this post on Patreon/Relay.";

export const PILOT_ADR004_DOC_PATH = "docs/architecture/adr/004-pilot-three-layer-permissions.md";
