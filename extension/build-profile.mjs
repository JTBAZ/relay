/** Validated build-only profiles; staging origins and identity cannot be overridden at runtime. */
export const STAGING_WEB_ORIGIN = "https://staging.relayapp.me";
export const STAGING_API_ORIGIN = "https://api.staging.relayapp.me";
export const STAGING_CHROME_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuleuEYl2xtKFBzGF/0nx/K3KptiGVQFE97ED5udGJZtp42RqfYqgBM2RutBpn9vLCDJXM8DGNo2M8W1q0xOxlm1OFAjAIMbpvNpVVkvmbtV5Q+XYPjBsGjzNEHIV2EO/4GS14cn9ZUwqxZNKCIpJ79WA5/2uudvV/TNeD7vju52EPAK6xmrUMaHDap3z1cUrWT/y07yMq1pgn0QZQNskK5eSBYaEwKHbumRl6jDI5dzJmzmYfkIr6Bkf38+V5le4RU7KnIjvnYWVr8J6i3bQB9vGuYQ8RXSYzXS/aQRJiy+paMd1OpzB/zF/1EK53mxGG38hX6ECi+Bckn5KrxWaKQIDAQAB";
export const STAGING_CHROME_ID = "goiogmlkfciaegafabjemnoibfgbigco";
export const STAGING_FIREFOX_ID = "relay-staging@relayapp.me";

export function extensionBuildProfile(target, env) {
  if (!["chrome", "firefox"].includes(target) || !["dev", "prod", "staging"].includes(env)) {
    throw new Error("Usage: node build.mjs <chrome|firefox> <dev|prod|staging>");
  }
  if (target === "firefox" && env === "dev") throw new Error("Firefox development profile is not supported.");
  return {
    target, env,
    manifestFile: target === "firefox" ? "manifest.firefox.prod.json" : `manifest.chrome.${env === "dev" ? "dev" : "prod"}.json`,
    outDir: `dist/${target}-${env}`
  };
}

export function manifestForProfile(manifest, profile) {
  if (profile.env !== "staging") return manifest;
  const staged = {
    ...manifest,
    name: `${manifest.name} (staging)`,
    host_permissions: [...manifest.host_permissions.filter(host => host !== "https://relayapp.me/*"), `${STAGING_WEB_ORIGIN}/*`, `${STAGING_API_ORIGIN}/*`],
    externally_connectable: { ...manifest.externally_connectable, matches: [`${STAGING_WEB_ORIGIN}/*`] }
  };
  if (profile.target === "chrome") staged.key = STAGING_CHROME_PUBLIC_KEY;
  else staged.browser_specific_settings = {
    ...manifest.browser_specific_settings,
    gecko: { ...manifest.browser_specific_settings.gecko, id: STAGING_FIREFOX_ID }
  };
  return staged;
}
