/**
 * Host-owned Previewizer ↔ Relay API adapter.
 * Previewizer package sources import from here (not `@/lib/relay-api`) so the
 * presentation boundary stays free of direct relay-api coupling.
 */
export {
  createPreviewTemplate,
  deletePreviewTemplate,
  fetchCreatorBlueskyCredential,
  fetchPatreonSyncState,
  fetchPreviewTemplates,
  type PreviewTemplateWire
} from "./relay-api";
