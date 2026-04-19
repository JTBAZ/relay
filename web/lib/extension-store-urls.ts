/**
 * Public install links for the Relay browser extension (Phase 7.B).
 * Set on the host after store publication — see `web/.env.example`.
 */
export type ExtensionStoreLinks = {
  chrome: string | null;
  edge: string | null;
  firefox: string | null;
};

export function getExtensionStoreLinks(): ExtensionStoreLinks {
  return {
    chrome: process.env.NEXT_PUBLIC_RELAY_EXTENSION_CHROME_URL?.trim() || null,
    edge: process.env.NEXT_PUBLIC_RELAY_EXTENSION_EDGE_URL?.trim() || null,
    firefox: process.env.NEXT_PUBLIC_RELAY_EXTENSION_FIREFOX_URL?.trim() || null
  };
}

export function hasAnyExtensionStoreLink(links: ExtensionStoreLinks): boolean {
  return Boolean(links.chrome || links.edge || links.firefox);
}
