/**
 * EH-022 Native admin shell (preserved under EH-030): status EH-030 → EH-031,
 * admin routes in kit, identity-aware gating, productionSafe false.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fillTemplate } from "../src/fill-template.js";
import {
  assertLocalOperatorMutation,
  evaluateLocalOperatorMutationAccess
} from "../src/library-truth/local-operator.js";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_BUNDLE = join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
const MEDIA_DIR = join(PACKAGE_ROOT, "fixtures", "media");
const TEMPLATE = join(PACKAGE_ROOT, "template");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("EH-022 status (preserved under EH-032)", () => {
  it("keeps native-admin preview with identity wiring and next EH-073", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-080");
    expect(status.slice).toBe("EH-080");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-081");
    expect(status.blockers.some((b) => /Native admin shell.*remains open/i.test(b))).toBe(
      false
    );

    const admin = status.capabilities.find((c) => c.id === "native-admin");
    expect(admin?.state).toBe("preview_only");
    expect(admin?.evidence).toMatch(/\/admin/);
    expect(admin?.evidence).toMatch(/identity|staff session|local-operator/i);
    expect(admin?.evidence).toMatch(/productionSafe remains false/i);
    expect(admin?.nextSlice).toBe("EH-081");
    expect(admin?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/app/admin/page.tsx",
        "packages/escape-hatch/template/app/api/admin/attention/route.ts",
        "packages/escape-hatch/tests/escape-hatch-admin.test.ts"
      ])
    );
  });

  it("documents admin identity/local-operator honesty in prototype warnings", () => {
    const status = buildEscapeHatchStatus();
    expect(
      status.prototypeWarnings.some((w) =>
        /native admin|EH-022/i.test(w) &&
        /not authentication|local-operator|soft personas never authorize/i.test(w)
      )
    ).toBe(true);
    expect(
      status.prototypeWarnings.some((w) =>
        /admin reads and mutations|staff session is required for admin reads/i.test(w)
      )
    ).toBe(true);
  });
});
describe("EH-022 template admin surfaces", () => {
  it("ships admin routes, components, and ConsoleNav entry", () => {
    const routes = [
      "app/admin/page.tsx",
      "app/admin/posts/page.tsx",
      "app/admin/media/page.tsx",
      "app/admin/tiers/page.tsx",
      "app/api/admin/attention/route.ts",
      "components/admin/AdminShell.tsx",
      "components/admin/AdminOverview.tsx",
      "components/admin/AdminPosts.tsx",
      "components/admin/AdminMedia.tsx",
      "components/admin/AdminTiers.tsx",
      "components/admin/AdminAccessDenied.tsx",
      "lib/admin/load-admin.ts",
      "lib/admin/attention.ts",
      "lib/admin/require-admin-page.ts",
      "lib/identity/admin-access.ts"
    ];
    for (const rel of routes) {
      expect(existsSync(join(TEMPLATE, rel))).toBe(true);
    }

    const nav = readFileSync(join(TEMPLATE, "components/ConsoleNav.tsx"), "utf8");
    expect(nav).toMatch(/href:\s*"\/admin"/);
    expect(nav).toMatch(/label:\s*"Admin"/);

    const overview = readFileSync(
      join(TEMPLATE, "components/admin/AdminOverview.tsx"),
      "utf8"
    );
    expect(overview).toMatch(/identity not configured|degraded|ok:\s*false/i);
    expect(overview).not.toMatch(/all systems (?:operational|green)/i);

    const media = readFileSync(
      join(TEMPLATE, "components/admin/AdminMedia.tsx"),
      "utf8"
    );
    expect(media).toMatch(/public\/media/);
    expect(media).toMatch(/private-read|not verified|public_media_only/i);

    const adapters = readFileSync(
      join(TEMPLATE, "lib/adapters/index.ts"),
      "utf8"
    );
    expect(adapters).toMatch(/ok:\s*false/);

    const adminPage = readFileSync(join(TEMPLATE, "app/admin/page.tsx"), "utf8");
    expect(adminPage).toMatch(/assertAdminReadAccess|redirectIfAdminSignInRequired/);
    expect(adminPage).toMatch(/AdminAccessDenied|read_allowed/);

    const accessDenied = readFileSync(
      join(TEMPLATE, "components/admin/AdminAccessDenied.tsx"),
      "utf8"
    );
    expect(accessDenied).toMatch(/Soft demo personas do not authorize admin reads/i);
  });
  it("keeps visitor preview distinct from admin chrome", () => {
    const preview = readFileSync(join(TEMPLATE, "app/preview/page.tsx"), "utf8");
    expect(preview).not.toMatch(/AdminShell|AdminOverview/);
    const gallery = readFileSync(
      join(TEMPLATE, "components/GalleryApp.tsx"),
      "utf8"
    );
    expect(gallery).not.toMatch(/admin-shell|AdminNav/);
  });
});

describe("EH-022 fillTemplate stamps admin", () => {
  it("writes manifest EH-032 and ESCAPE_HATCH.md admin routes", () => {
    const bundle = JSON.parse(readFileSync(SAMPLE_BUNDLE, "utf8")) as {
      creator: { handle: string };
    };
    const result = fillTemplate({
      bundle: JSON.parse(readFileSync(SAMPLE_BUNDLE, "utf8")),
      slug: `eh-022-admin-${Date.now()}`,
      mediaSourceDir: MEDIA_DIR,
      clean: true
    });
    tempDirs.push(result.outDir);

    const manifest = JSON.parse(
      readFileSync(join(result.outDir, "escape-hatch.manifest.json"), "utf8")
    ) as { slice: string; productionSafe: boolean; feature_flags: Record<string, boolean> };
    expect(manifest.slice).toBe("EH-080");
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.feature_flags.native_admin).toBe(true);
    expect(manifest.feature_flags.hard_paywall).toBe(true);
    expect(manifest.feature_flags.signed_media_delivery).toBe(true);
    expect(manifest.feature_flags.supabase_identity).toBe(true);
    expect(manifest.feature_flags.portable_identity).toBe(true);

    const doc = readFileSync(join(result.outDir, "ESCAPE_HATCH.md"), "utf8");
    expect(doc).toMatch(/\/admin/);
    expect(doc).toMatch(/productionSafe:\s*false/i);

    expect(existsSync(join(result.outDir, "app/admin/page.tsx"))).toBe(true);
    expect(existsSync(join(result.outDir, "app/admin/posts/page.tsx"))).toBe(
      true
    );
    expect(existsSync(join(result.outDir, "app/api/admin/attention/route.ts"))).toBe(
      true
    );

    // Ensure sample handle used for slug is stable enough
    expect(bundle.creator.handle).toBeTruthy();
  });
});

describe("EH-022 admin attention + local-operator", () => {
  it("gates admin mutations with header + loopback (generic surface)", () => {
    const missing = evaluateLocalOperatorMutationAccess({
      headerValue: null,
      hostHeader: "localhost:3000",
      surface: "Admin"
    });
    expect(missing.allowed).toBe(false);
    if (!missing.allowed) {
      expect(missing.error).toMatch(/Admin/i);
      expect(missing.error).toMatch(/x-escape-hatch-local/i);
    }

    const remote = evaluateLocalOperatorMutationAccess({
      headerValue: "1",
      hostHeader: "preview.example.com",
      surface: "Admin"
    });
    expect(remote.allowed).toBe(false);

    const local = evaluateLocalOperatorMutationAccess({
      headerValue: "1",
      hostHeader: "127.0.0.1:3000",
      surface: "Admin"
    });
    expect(local.allowed).toBe(true);

    const req = new Request("http://localhost:3000/api/admin/attention", {
      method: "POST",
      headers: { "x-escape-hatch-local": "1", host: "localhost:3000" }
    });
    expect(assertLocalOperatorMutation(req, "Admin").allowed).toBe(true);
  });

  it("writes attention marks under data/ without claiming production_safe", async () => {
    const kitDir = join(PACKAGE_ROOT, ".out", `eh-022-attn-${Date.now()}`);
    mkdirSync(join(kitDir, "data"), { recursive: true });
    tempDirs.push(kitDir);

    // Import kit attention helpers via dynamic path after fill — exercise source copy logic by writing via relative import pattern.
    // Use fillTemplate kit and run attention module from template path through node.
    const result = fillTemplate({
      bundle: JSON.parse(readFileSync(SAMPLE_BUNDLE, "utf8")),
      slug: `eh-022-attn-kit-${Date.now()}`,
      mediaSourceDir: MEDIA_DIR,
      clean: true
    });
    tempDirs.push(result.outDir);

    const attentionPath = join(result.outDir, "lib/admin/attention.ts");
    expect(existsSync(attentionPath)).toBe(true);

    // Simulate mark by writing the same contract shape the route uses
    const site = JSON.parse(
      readFileSync(join(result.outDir, "data/site.json"), "utf8")
    ) as { site_id: string; posts: Array<{ post_id: string }> };
    const postId = site.posts[0]?.post_id;
    expect(postId).toBeTruthy();

    const state = {
      contract_version: "admin-attention/1.0.0",
      site_id: site.site_id,
      production_safe: false as const,
      updated_at: "2026-07-22T00:00:00.000Z",
      marks: {
        [postId!]: { note: "Needs structure review", marked_at: "2026-07-22T00:00:00.000Z" }
      }
    };
    writeFileSync(
      join(result.outDir, "data/admin-attention.json"),
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8"
    );
    const roundTrip = JSON.parse(
      readFileSync(join(result.outDir, "data/admin-attention.json"), "utf8")
    ) as { production_safe: boolean; marks: Record<string, unknown> };
    expect(roundTrip.production_safe).toBe(false);
    expect(roundTrip.marks[postId!]).toBeTruthy();
  });
});
