import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  extensionBuildProfile, manifestForProfile, STAGING_WEB_ORIGIN, STAGING_API_ORIGIN,
  STAGING_CHROME_PUBLIC_KEY, STAGING_CHROME_ID, STAGING_FIREFOX_ID
} from "../../extension/build-profile.mjs";

const manifest = (name: string) => JSON.parse(readFileSync(`extension/manifests/${name}`, "utf8"));

describe("bounded staging extension build profile", () => {
  it.each(["chrome", "firefox"])("isolates %s output, manifest permissions and identity", (target) => {
    const profile = extensionBuildProfile(target, "staging"), base = manifest(profile.manifestFile);
    const original = structuredClone(base), staged = manifestForProfile(base, profile);
    expect(profile.outDir).toBe(`dist/${target}-staging`);
    expect(staged.name).toBe(`${base.name} (staging)`);
    expect(staged.host_permissions).toEqual([
      ...base.host_permissions.filter((host: string) => host !== "https://relayapp.me/*"),
      `${STAGING_WEB_ORIGIN}/*`, `${STAGING_API_ORIGIN}/*`
    ]);
    expect(staged.externally_connectable).toEqual({ matches: [`${STAGING_WEB_ORIGIN}/*`] });
    expect(staged.background).toEqual(base.background);
    if (target === "chrome") expect(staged.key).toBe(STAGING_CHROME_PUBLIC_KEY);
    else expect(staged.browser_specific_settings).toEqual({
      ...base.browser_specific_settings, gecko: { ...base.browser_specific_settings.gecko, id: STAGING_FIREFOX_ID }
    });
    expect(base).toEqual(original);
  });

  it("keeps the local Chrome identity stable and distinct from production", () => {
    const digest = createHash("sha256").update(Buffer.from(STAGING_CHROME_PUBLIC_KEY, "base64")).digest("hex").slice(0, 32);
    const id = [...digest].map((value) => String.fromCharCode(97 + Number.parseInt(value, 16))).join("");
    expect(id).toBe(STAGING_CHROME_ID);
    expect(STAGING_CHROME_PUBLIC_KEY).not.toBe(manifest("manifest.chrome.prod.json").key);
    expect(STAGING_FIREFOX_ID).toBe("relay-staging@relayapp.me");
    expect(STAGING_FIREFOX_ID).not.toBe(manifest("manifest.firefox.prod.json").browser_specific_settings.gecko.id);
  });

  it.each([["chrome", "dev"], ["chrome", "prod"], ["firefox", "prod"]])("preserves %s %s manifest and output", (target, env) => {
    const profile = extensionBuildProfile(target, env), base = manifest(profile.manifestFile);
    expect(profile.outDir).toBe(`dist/${target}-${env}`);
    expect(manifestForProfile(base, profile)).toEqual(base);
  });

  it.each([["chrome", "preview"], ["chrome", "https://other.example"], ["edge", "staging"], ["firefox", "dev"]])("rejects unsupported target/profile %s %s", (target, env) => {
    expect(() => extensionBuildProfile(target, env)).toThrow();
  });
});

function runtimeProfile(env: "dev" | "prod" | "staging") {
  const built = buildSync({
    entryPoints: ["extension/src/lib/constants.ts"], bundle: true, write: false,
    platform: "node", format: "cjs", minify: true,
    define: { __EXT_ENV__: JSON.stringify(env), __EXT_DEV_API_PORT__: "8787" }
  });
  const code = built.outputFiles[0]!.text, module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, atob });
  return { code, policy: module.exports as typeof import("../../extension/src/lib/constants") };
}

describe.each(["dev", "prod", "staging"] as const)("%s compiled origin policy", (env) => {
  it("routes API, consent senders and notifications to the selected build", () => {
    const { policy, code } = runtimeProfile(env);
    expect(policy.RELAY_WEB_BASE).toBe(env === "dev" ? "http://localhost:3000" : env === "staging" ? STAGING_WEB_ORIGIN : "https://relayapp.me");
    expect(policy.RELAY_API_BASE).toBe(env === "dev" ? "http://localhost:8787" : env === "staging" ? STAGING_API_ORIGIN : "https://relayapp.me");
    expect(policy.relayWebOriginAllowed(`${STAGING_WEB_ORIGIN}/extension/authorize`)).toBe(env === "staging");
    expect(policy.relayWebOriginAllowed("https://relayapp.me/extension/authorize")).toBe(env !== "staging");
    for (const local of ["http://localhost:3000/", "http://127.0.0.1:3000/"]) {
      expect(policy.relayWebOriginAllowed(local)).toBe(env === "dev");
    }
    for (const rejected of [undefined, `${STAGING_API_ORIGIN}/`, "https://staging.relayapp.me.attacker.example/", "https://user@staging.relayapp.me/", "http://staging.relayapp.me/", "https://staging.relayapp.me:444/"]) {
      expect(policy.relayWebOriginAllowed(rejected)).toBe(false);
    }
    expect([...policy.relayTabUrlPatterns()]).toEqual(env === "staging" ? [`${STAGING_WEB_ORIGIN}/*`]
      : env === "dev" ? ["http://localhost/*", "http://127.0.0.1/*", "https://relayapp.me/*"] : ["https://relayapp.me/*"]);
  });
});
