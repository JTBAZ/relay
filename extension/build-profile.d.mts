export type ExtensionBuildProfile = {
  target: "chrome" | "firefox";
  env: "dev" | "prod" | "staging";
  manifestFile: string;
  outDir: string;
};
export const STAGING_WEB_ORIGIN: string;
export const STAGING_API_ORIGIN: string;
export const STAGING_CHROME_PUBLIC_KEY: string;
export const STAGING_CHROME_ID: string;
export const STAGING_FIREFOX_ID: string;
export function extensionBuildProfile(target: string, env: string): ExtensionBuildProfile;
export function manifestForProfile(manifest: Record<string, unknown>, profile: ExtensionBuildProfile): Record<string, unknown>;
