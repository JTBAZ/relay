/**
 * EH-010 sanitized golden fixture matrix, provenance, and secret/PII scan.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canViewPost,
  parseCloneSiteModelInput,
  parseSiteBundle,
  SITE_BUNDLE_CONTRACT_VERSION,
  CLONE_SITE_MODEL_CONTRACT_VERSION,
  type SiteBundle
} from "../src/contracts.js";
import {
  FIXTURE_SCAN_ALLOWLIST,
  formatFixtureScanFindings,
  scanFixtureTree
} from "../src/fixture-scan.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(PACKAGE_ROOT, "fixtures");
const MATRIX_PATH = join(FIXTURE_ROOT, "MATRIX.json");
const PROVENANCE_PATH = join(FIXTURE_ROOT, "PROVENANCE.md");

type MatrixFamily = {
  id: string;
  status: "present" | "deferred-to-EH-011" | "deferred-to-EH-012" | "deferred-to-EH-033";
  kind: string;
  paths: string[];
  reason?: string;
  notes?: string;
  postIds?: string[];
};

type FixtureMatrix = {
  schemaVersion: string;
  slice: string;
  productionSafe: boolean;
  provenance: string;
  families: MatrixFamily[];
};

const EXPECTED_PRESENT_IDS = [
  "baseline-sample-bundle",
  "baseline-clone-site",
  "baseline-relay-dump",
  "public-text-only",
  "all-patrons-with-image",
  "exact-tier",
  "tier-or-higher",
  "multi-media-gallery",
  "free-vs-paid",
  "export-failure",
  "unicode-rich",
  "multi-tier-floors",
  "duplicate-cdn-urls",
  "missing-cover-attachment",
  "deleted-tombstoned",
  "legacy-tier-rename",
  "video-audio-embed"
] as const;

const EXPECTED_DEFERRED_IDS = ["mature-metadata"] as const;

function loadMatrix(): FixtureMatrix {
  return JSON.parse(readFileSync(MATRIX_PATH, "utf8")) as FixtureMatrix;
}

function readFixtureRel(rel: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, rel), "utf8"));
}

function fixtureHash(rel: string): string {
  return createHash("sha256")
    .update(readFileSync(join(FIXTURE_ROOT, rel)))
    .digest("hex");
}

describe("EH-010 fixture matrix index", () => {
  it("lists every expected present and deferred family", () => {
    const matrix = loadMatrix();
    expect(matrix.schemaVersion).toBe("escape-hatch-fixture-matrix/1.0.0");
    expect(matrix.slice).toBe("EH-022");
    expect(matrix.productionSafe).toBe(false);

    const byId = new Map(matrix.families.map((f) => [f.id, f]));
    for (const id of EXPECTED_PRESENT_IDS) {
      expect(byId.get(id)?.status).toBe("present");
    }
    for (const id of EXPECTED_DEFERRED_IDS) {
      const fam = byId.get(id);
      expect(fam?.status).toBe("deferred-to-EH-033");
      expect(fam?.reason?.length).toBeGreaterThan(10);
    }
    expect(matrix.families.map((f) => f.id).sort()).toEqual(
      [...EXPECTED_PRESENT_IDS, ...EXPECTED_DEFERRED_IDS].slice().sort()
    );
  });

  it("resolves every matrix path on disk", () => {
    const matrix = loadMatrix();
    expect(existsSync(PROVENANCE_PATH)).toBe(true);
    for (const family of matrix.families) {
      expect(family.paths.length).toBeGreaterThan(0);
      for (const rel of family.paths) {
        expect(existsSync(join(FIXTURE_ROOT, rel)), rel).toBe(true);
      }
    }
  });

  it("marks deferred stubs without claiming importer or R2 success", () => {
    for (const id of EXPECTED_DEFERRED_IDS) {
      const stub = readFixtureRel(`matrix/deferred/${id}.stub.json`) as {
        status: string;
        reason: string;
      };
      expect(stub.status).toBe("deferred-to-EH-033");
      expect(stub.reason.toLowerCase()).toMatch(/eh-033/);
      expect(JSON.stringify(stub).toLowerCase()).not.toMatch(
        /successfully imported|import succeeded|importer succeeded|r2 copy succeeded/
      );
    }
  });

  it("documents video-audio-embed migration accounting without visitor players", () => {
    const fam = loadMatrix().families.find((f) => f.id === "video-audio-embed");
    expect(fam?.status).toBe("present");
    expect(fam?.notes?.toLowerCase()).toMatch(/migrat/);
    expect(fam?.notes?.toLowerCase()).toMatch(/eh-033|no visitor|no.*player/);
    const stub = readFixtureRel("matrix/deferred/video-audio-embed.stub.json") as {
      status: string;
    };
    expect(stub.status).toBe("present");
  });
});

describe("EH-010 provenance", () => {
  it("documents sanitization, oddities, and no-live-secrets confirmation", () => {
    const text = readFileSync(PROVENANCE_PATH, "utf8");
    expect(text).toMatch(/sanitiz/i);
    expect(text).toMatch(/cdn\.fixture\.example/);
    expect(text).toMatch(/No live tokens/i);
    expect(text).toMatch(/EH-010/);
    expect(text).toMatch(/EH-011/);
    expect(text).toMatch(/EH-013/);
    expect(text).toMatch(/EH-020/);
    expect(text).toMatch(/EH-022/);
    expect(text).toMatch(/EH-030/);
    expect(text).toMatch(/sparse `included`|sparse included/i);
    expect(text).toMatch(/public\/media/);
  });
});

describe("EH-010 secret/PII scan", () => {
  it("keep allowlist free of secret-shaped neutralizers", () => {
    const blob = JSON.stringify(FIXTURE_SCAN_ALLOWLIST);
    expect(blob).not.toMatch(/sk_(live|test)_/i);
    expect(blob).not.toMatch(/\bBearer\b/i);
    expect(blob).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(blob).not.toMatch(/PRIVATE KEY/i);
    expect(blob).not.toMatch(/lineNeutralizers/i);
  });

  it("scans the full fixtures tree and finds no leaks", () => {
    const result = scanFixtureTree(FIXTURE_ROOT);
    expect(result.scannedFiles).toBeGreaterThan(10);
    expect(result.findings, formatFixtureScanFindings(result)).toEqual([]);
  });

  it("fails closed when a secret pattern is introduced", () => {
    const dir = mkdtempSync(join(tmpdir(), "eh-010-scan-"));
    try {
      writeFileSync(
        join(dir, "leak.json"),
        JSON.stringify({ token: "sk_live_abcdefghijklmnop" }),
        "utf8"
      );
      const result = scanFixtureTree(dir);
      expect(result.findings.some((f) => f.ruleId === "stripe-secret")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not allow real emails via same-line fixture-domain bleed", () => {
    const dir = mkdtempSync(join(tmpdir(), "eh-010-email-"));
    try {
      writeFileSync(
        join(dir, "bleed.json"),
        JSON.stringify({
          note: "contact real.person@gmail.com or safe@fixture.example"
        }),
        "utf8"
      );
      const result = scanFixtureTree(dir);
      const emails = result.findings.filter((f) => f.ruleId === "email");
      expect(emails.some((f) => /gmail\.com/i.test(f.detail))).toBe(true);
      expect(emails.every((f) => !/@fixture\.example/i.test(f.detail))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on non-placeholder access_token assignments", () => {
    const dir = mkdtempSync(join(tmpdir(), "eh-010-oauth-"));
    try {
      writeFileSync(
        join(dir, "tokens.json"),
        JSON.stringify({
          access_token: "ya29.live-looking-oauth-value",
          refresh_token: "1//redacted-looking-but-not",
          token: "fixture"
        }),
        "utf8"
      );
      const result = scanFixtureTree(dir);
      const oauth = result.findings.filter((f) => f.ruleId === "oauth-token-assignment");
      expect(oauth.some((f) => /access_token/i.test(f.detail))).toBe(true);
      expect(oauth.some((f) => /refresh_token/i.test(f.detail))).toBe(true);
      expect(oauth.every((f) => !/token":"fixture"|token:\s*"fixture"/i.test(f.detail))).toBe(
        true
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects production CDN hosts and allows documented fixture hosts", () => {
    const dir = mkdtempSync(join(tmpdir(), "eh-010-host-"));
    try {
      writeFileSync(
        join(dir, "hosts.json"),
        JSON.stringify({
          bad: "https://c10.patreonusercontent.com/media.png",
          alsoBad: "https://www.patreon.com/file",
          good: "https://cdn.fixture.example/media.png"
        }),
        "utf8"
      );
      const result = scanFixtureTree(dir);
      const hosts = result.findings.filter((f) => f.ruleId === "url-host");
      expect(hosts.some((f) => /patreonusercontent\.com/i.test(f.detail))).toBe(true);
      expect(hosts.some((f) => /patreon\.com/i.test(f.detail))).toBe(true);
      expect(hosts.every((f) => !/cdn\.fixture\.example/i.test(f.detail))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to silently skip a missing fixture root", () => {
    expect(() =>
      scanFixtureTree(join(FIXTURE_ROOT, "does-not-exist-eh-010"))
    ).toThrow(/fixture-scan/i);
  });
});

describe("EH-010 Patreon-shaped structural fixtures", () => {
  it("preserves oauth public text-only oddities", () => {
    const doc = readFixtureRel("matrix/patreon/oauth-public-text-only.json") as {
      data: Array<{ id: string; attributes: Record<string, unknown> }>;
      included?: unknown;
    };
    expect(doc.data).toHaveLength(1);
    expect(doc.data[0].id).toBe("fixture_post_public_text");
    expect(doc.data[0].attributes.tiers).toEqual([]);
    expect(doc.data[0].attributes.is_public).toBe(true);
    expect(String(doc.data[0].attributes.content)).toMatch(/<p>/);
    expect(doc.included).toBeUndefined();
  });

  it("preserves cookie raw numeric tier + sparse included CDN host", () => {
    const doc = readFixtureRel(
      "matrix/patreon/cookie-exact-tier-with-media.json"
    ) as {
      data: Array<{ attributes: { tiers: string[] }; relationships: unknown }>;
      included: Array<{ attributes: { download_url: string } }>;
    };
    expect(doc.data[0].attributes.tiers).toEqual(["555"]);
    expect(doc.data[0].relationships).toBeTruthy();
    expect(doc.included).toHaveLength(1);
    expect(doc.included[0].attributes.download_url).toContain(
      "cdn.fixture.example"
    );
  });

  it("preserves duplicate CDN URLs intentionally", () => {
    const doc = readFixtureRel(
      "matrix/patreon/oauth-duplicate-cdn-urls.json"
    ) as {
      included: Array<{ attributes: { download_url: string } }>;
    };
    expect(doc.included).toHaveLength(2);
    expect(doc.included[0].attributes.download_url).toBe(
      doc.included[1].attributes.download_url
    );
  });

  it("carries unicode title and long sanitized rich HTML body", () => {
    const doc = readFixtureRel(
      "matrix/patreon/oauth-unicode-rich-body.json"
    ) as {
      data: Array<{ attributes: { title: string; content: string } }>;
    };
    expect(doc.data[0].attributes.title).toMatch(/作品/);
    expect(doc.data[0].attributes.content.length).toBeGreaterThan(400);
    expect(doc.data[0].attributes.content).toMatch(/cdn\.fixture\.example/);
  });
});

describe("EH-010 SiteBundle / CloneSiteModel contract wiring", () => {
  it("parses access-matrix SiteBundle without mutating the fixture", () => {
    const rel = "matrix/site-bundles/access-matrix.bundle.json";
    const before = fixtureHash(rel);
    const bundle = parseSiteBundle(readFixtureRel(rel));
    expect(bundle.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);
    expect(bundle.site_id).toBe("site_fixture_access_matrix");
    expect(bundle.tiers.map((t) => t.tier_id)).toEqual([
      "t_free",
      "t_silver",
      "t_gold",
      "t_platinum"
    ]);
    expect(bundle.tiers.every((t) => typeof t.amount_cents === "number")).toBe(
      true
    );
    expect(bundle.posts.find((p) => p.post_id === "p_public_text")?.media).toEqual(
      []
    );
    expect(
      bundle.posts.find((p) => p.post_id === "p_gallery")?.media
    ).toHaveLength(3);
    expect(
      bundle.posts.find((p) => p.post_id === "p_export_missing")?.media[0]
        .has_export
    ).toBe(false);
    expect(fixtureHash(rel)).toBe(before);
  });

  it("parses unicode-rich SiteBundle slug/title", () => {
    const bundle = parseSiteBundle(
      readFixtureRel("matrix/site-bundles/unicode-rich.bundle.json")
    );
    expect(bundle.posts[0].slug).toBe("作品-été.2026");
    expect(bundle.posts[0].title).toMatch(/日本語/);
  });

  it("parses export-failure and multi-media clone fixtures", () => {
    const fail = parseCloneSiteModelInput(
      readFixtureRel("matrix/clone-sites/export-failure.clone.json")
    );
    expect(fail.contract_version).toBe(CLONE_SITE_MODEL_CONTRACT_VERSION);
    expect(fail.posts.find((p) => p.post_id === "p_export_fail")?.media[0].has_export).toBe(
      false
    );

    const multi = parseCloneSiteModelInput(
      readFixtureRel("matrix/clone-sites/multi-media.clone.json")
    );
    expect(multi.posts.find((p) => p.post_id === "p_gallery_clone")?.media).toHaveLength(
      3
    );
    expect(
      multi.posts.find((p) => p.post_id === "p_attachment_only")?.media[0].mime_type
    ).toBe("application/pdf");
  });

  it("keeps baseline sample.bundle and clone-site green", () => {
    const sample = parseSiteBundle(readFixtureRel("sample.bundle.json"));
    expect(sample.posts).toHaveLength(3);
    const clone = parseCloneSiteModelInput(readFixtureRel("clone-site.json"));
    expect(clone.posts[1].media[0].has_export).toBe(false);
  });
});

describe("EH-010 preview access semantics from matrix bundle", () => {
  function personas(bundle: SiteBundle): Map<string, SiteBundle["demo_personas"][number]> {
    return new Map(bundle.demo_personas.map((p) => [p.id, p]));
  }

  it("distinguishes free follower vs paid member for member_only", () => {
    const bundle = parseSiteBundle(
      readFixtureRel("matrix/site-bundles/access-matrix.bundle.json")
    );
    const byId = personas(bundle);
    const post = bundle.posts.find((p) => p.post_id === "p_all_patrons")!;
    expect(canViewPost(post, byId.get("public")!)).toBe(false);
    expect(canViewPost(post, byId.get("free_follower")!)).toBe(false);
    expect(canViewPost(post, byId.get("patron_silver")!)).toBe(true);
  });

  it("applies exact-tier and tier-or-higher amount_cents floors", () => {
    const bundle = parseSiteBundle(
      readFixtureRel("matrix/site-bundles/access-matrix.bundle.json")
    );
    const byId = personas(bundle);
    const exact = bundle.posts.find((p) => p.post_id === "p_exact_gold")!;
    expect(exact.access.match_mode).toBe("exact");
    expect(canViewPost(exact, byId.get("patron_silver")!)).toBe(false);
    expect(canViewPost(exact, byId.get("patron_gold")!)).toBe(true);
    expect(canViewPost(exact, byId.get("patron_platinum")!)).toBe(false);

    const higher = bundle.posts.find(
      (p) => p.post_id === "p_tier_or_higher_silver"
    )!;
    expect(higher.access.match_mode).toBe("tier_or_higher");
    expect(canViewPost(higher, byId.get("free_follower")!)).toBe(false);
    expect(canViewPost(higher, byId.get("patron_silver")!)).toBe(true);
    expect(canViewPost(higher, byId.get("patron_gold")!)).toBe(true);
    expect(canViewPost(higher, byId.get("patron_platinum")!)).toBe(true);
  });

  it("allows public text-only for every persona", () => {
    const bundle = parseSiteBundle(
      readFixtureRel("matrix/site-bundles/access-matrix.bundle.json")
    );
    const post = bundle.posts.find((p) => p.post_id === "p_public_text")!;
    for (const persona of bundle.demo_personas) {
      expect(canViewPost(post, persona)).toBe(true);
    }
  });
});

describe("EH-010 media placeholders", () => {
  it("only ships synthetic SVG placeholders under fixtures/media", () => {
    const mediaDir = join(FIXTURE_ROOT, "media");
    const names = readdirSync(mediaDir);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.endsWith(".svg")).toBe(true);
      const text = readFileSync(join(mediaDir, name), "utf8");
      expect(text).toMatch(/<svg\b/);
      expect(text.length).toBeLessThan(2_000);
    }
  });
});
