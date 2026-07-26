/**
 * Curated file lists for repo-to-v0 patron feed exports.
 * Paths are repo-relative from the Rescue root (parent of `web/`).
 */

/** @type {Record<string, { description: string; files: string[]; omitByDefault?: string[] }>} */
export const PATRON_FEED_SCOPES = {
  visual: {
    description:
      'Fixture-driven patron feed slice (patron-home-client + feed card UI). Best for v0 visual edits.',
    files: [
      'web/app/patron/feed/page.tsx',
      'web/app/patron/feed/patron-mock.css',
      'web/components/patron/relay/patron-home-client.tsx',
      'web/components/patron/relay/relay-shell.tsx',
      'web/components/patron/relay/feed-card.tsx',
      'web/components/patron/relay/feed-section-divider.tsx',
      'web/components/patron/relay/filter-chips.tsx',
      'web/components/patron/relay/patron-empty-feed-state.tsx',
      'web/components/patron/relay/empty-state.tsx',
      'web/components/patron/relay/error-banner.tsx',
      'web/components/patron/relay/command-palette.tsx',
      'web/components/patron/relay/relay-mark-icon.tsx',
      'web/components/patron/relay/gallery-media-stack.tsx',
      'web/components/patron/relay/media-edge-rail.tsx',
      'web/components/patron/relay/patron-feed-playback.tsx',
      'web/components/patron/relay/snip-to-collection-dialog.tsx',
      'web/app/components/RoleSwitcher.tsx',
      'web/app/components/icons/SnipIcon.tsx',
      'web/lib/relay-fixtures.ts',
      'web/lib/patron-relay-feed-bundle.json',
      'web/lib/patron-feed-media.ts',
      'web/lib/format-feed-published-date.ts',
    ],
    omitByDefault: ['web/components/patron/relay/gallery-view.tsx'],
  },
  production: {
    description:
      'Production patron feed (RelayApp + API wiring). Large — prefer --write-file; omit relay-api unless --include-large.',
    files: [
      'web/app/patron/feed/page.tsx',
      'web/app/patron/feed/patron-mock.css',
      'web/app/patron/feed/PatronFeedDevPreviewClient.tsx',
      'web/components/patron/relay/relay-app.tsx',
      'web/components/patron/relay/discover-grid.tsx',
      'web/components/patron/relay/feed-card.tsx',
      'web/components/patron/relay/feed-section-divider.tsx',
      'web/components/patron/relay/filter-chips.tsx',
      'web/components/patron/relay/patron-empty-feed-state.tsx',
      'web/components/patron/relay/empty-state.tsx',
      'web/components/patron/relay/error-banner.tsx',
      'web/components/patron/relay/patron-entitlement-stale-banner.tsx',
      'web/components/patron/relay/command-palette.tsx',
      'web/components/patron/relay/gallery-view.tsx',
      'web/components/patron/relay/connect-campaign-modal.tsx',
      'web/components/patron/relay/settings-modal.tsx',
      'web/components/patron/relay/patron-feed-dev-tools.tsx',
      'web/components/patron/relay/relay-mark-icon.tsx',
      'web/components/patron/relay/what-you-missed-carousel.tsx',
      'web/components/patron/relay/gallery-media-stack.tsx',
      'web/components/patron/relay/media-edge-rail.tsx',
      'web/components/patron/relay/patron-feed-playback.tsx',
      'web/components/patron/relay/comment-pin.tsx',
      'web/components/patron/relay/comment-thread-panel.tsx',
      'web/components/patron/relay/snip-to-collection-dialog.tsx',
      'web/components/patron/PatronPrimaryTopNav.tsx',
      'web/app/components/RoleSwitcher.tsx',
      'web/app/components/icons/SnipIcon.tsx',
      'web/lib/relay-fixtures.ts',
      'web/lib/patron-relay-feed-bundle.json',
      'web/lib/patron-feed-api.ts',
      'web/lib/patron-follows-api.ts',
      'web/lib/patron-connect-campaign-prompt.ts',
      'web/lib/patron-feed-telemetry.ts',
      'web/lib/patron-feed-media.ts',
      'web/lib/format-feed-published-date.ts',
      'web/lib/relay-session-logout.ts',
    ],
    omitByDefault: ['web/lib/relay-api.ts'],
  },
}

/** Synthetic excerpt written into the bundle (not a real on-disk path). */
export const RELAY_TOKENS_EXCERPT_LABEL = 'web/app/globals.css (relay-tokens-excerpt)'
