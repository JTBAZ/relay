/**
 * EH-001 shared contract tests.
 * Fixtures are read-only; normalization must not mutate on-disk files.
 */

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SITE_BUNDLE_CONTRACT_VERSION,
  SITE_BUNDLE_CONTRACT_VERSION_LEGACY,
  CLONE_SITE_MODEL_CONTRACT_VERSION,
  GENERATED_APP_DATA_CONTRACT_VERSION,
  ContractValidationError,
  parseSiteBundle,
  parseCloneSiteModelInput,
  serializeSiteBundle,
  canAccessPost,
  canViewPost,
  buildTierCatalog,
  isFreeTier,
  paidUserTierIds,
  tierFloorCents,
  userMeetsTierGatesWithOrdering,
  type SiteBundle,
  type CloneTierRule,
  type DemoPersona
} from "../src/contracts.js";
import { fromClone } from "../src/from-clone.js";
import {
  CONTRACTS_SOURCE_PATH,
  fillTemplate,
  PACKAGE_ROOT,
  embedContractsModule
} from "../src/fill-template.js";

const require = createRequire(import.meta.url);

function readFixtureJson(name: string): unknown {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "fixtures", name), "utf8")
  );
}

function fixtureHash(name: string): string {
  const buf = readFileSync(join(PACKAGE_ROOT, "fixtures", name));
  return createHash("sha256").update(buf).digest("hex");
}

function expectFieldPathError(fn: () => unknown, fieldPath: string): ContractValidationError {
  try {
    fn();
    throw new Error("expected ContractValidationError");
  } catch (err) {
    expect(err).toBeInstanceOf(ContractValidationError);
    const e = err as ContractValidationError;
    expect(e.fieldPath).toBe(fieldPath);
    return e;
  }
}

describe("contract versions", () => {
  it("exposes stable serialized version constants", () => {
    expect(SITE_BUNDLE_CONTRACT_VERSION).toBe("site-bundle/1.0.0");
    expect(SITE_BUNDLE_CONTRACT_VERSION_LEGACY).toBe("site-bundle/0");
    expect(CLONE_SITE_MODEL_CONTRACT_VERSION).toBe("clone-site-model/1.0.0");
    expect(GENERATED_APP_DATA_CONTRACT_VERSION).toBe(SITE_BUNDLE_CONTRACT_VERSION);
  });

  it("accepts current version and serializes deterministically", () => {
    const legacy = readFixtureJson("sample.bundle.json");
    const a = parseSiteBundle(legacy);
    const b = parseSiteBundle(JSON.parse(serializeSiteBundle(a)));
    expect(a.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);
    expect(serializeSiteBundle(a)).toBe(serializeSiteBundle(b));
    expect(serializeSiteBundle(a)).toContain(`"contract_version": "${SITE_BUNDLE_CONTRACT_VERSION}"`);
  });
});

describe("legacy fixture normalization", () => {
  it("upgrades unchanged sample.bundle.json without mutating the fixture file", () => {
    const before = fixtureHash("sample.bundle.json");
    const legacy = readFixtureJson("sample.bundle.json") as Record<string, unknown>;
    expect(legacy.contract_version).toBeUndefined();

    const bundle = parseSiteBundle(legacy);
    expect(bundle.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);
    expect(bundle.site_id).toBe("site_fixture_sample");
    expect(bundle.creator.handle).toBe("elena-adler");
    expect(bundle.posts).toHaveLength(3);
    expect(bundle.posts[0].access.level).toBe("public");
    expect(bundle.posts[1].access.level).toBe("member_only");
    expect(bundle.posts[2].access.level).toBe("tier_gated");
    expect(bundle.posts[2].access.match_mode).toBe("tier_or_higher");
    // Compatibility: personas receive tier_catalog snapshots from site.tiers
    expect(bundle.demo_personas.every((p) => (p.tier_catalog?.length ?? 0) === 2)).toBe(
      true
    );
    expect(fixtureHash("sample.bundle.json")).toBe(before);
  });

  it("upgrades unchanged clone-site.json", () => {
    const before = fixtureHash("clone-site.json");
    const legacy = readFixtureJson("clone-site.json") as Record<string, unknown>;
    expect(legacy.contract_version).toBeUndefined();

    const clone = parseCloneSiteModelInput(legacy);
    expect(clone.contract_version).toBe(CLONE_SITE_MODEL_CONTRACT_VERSION);
    expect(clone.site_id).toBe("site_clone_fixture");
    expect(clone.posts[0].media[0].has_export).toBe(true);
    expect(clone.posts[1].media[0].has_export).toBe(false);
    expect(fixtureHash("clone-site.json")).toBe(before);
  });
});

describe("validation fail-closed", () => {
  const base = () => parseSiteBundle(readFixtureJson("sample.bundle.json"));

  it("rejects malformed nested fields with field-path errors", () => {
    const bad = base() as unknown as Record<string, unknown>;
    bad.posts = [{ ...base().posts[0], access: { level: "nope", tier_ids: [] } }];
    expectFieldPathError(() => parseSiteBundle(bad), "posts[0].access.level");
  });

  it("rejects missing required ids", () => {
    const bad = { ...base(), site_id: "" };
    expectFieldPathError(() => parseSiteBundle(bad), "site_id");
  });

  it("rejects non-array posts", () => {
    const bad = { ...base(), posts: "nope" };
    expectFieldPathError(() => parseSiteBundle(bad), "posts");
  });

  it("rejects non-finite total_media", () => {
    const bad = { ...base(), total_media: Number.NaN };
    expectFieldPathError(() => parseSiteBundle(bad), "total_media");
  });

  it("rejects invalid access level", () => {
    const clone = parseCloneSiteModelInput(readFixtureJson("clone-site.json"));
    const bad = {
      ...clone,
      tiers: [{ tier_id: "t1", title: "T", access_level: "vip" }]
    };
    expectFieldPathError(() => parseCloneSiteModelInput(bad), "tiers[0].access_level");
  });

  it("applies timestamp, media-count and path safety invariants to clone input", () => {
    const clone = parseCloneSiteModelInput(readFixtureJson("clone-site.json"));
    expectFieldPathError(
      () => parseCloneSiteModelInput({ ...clone, generated_at: "2026-02-30T00:00:00Z" }),
      "generated_at"
    );
    expectFieldPathError(
      () => parseCloneSiteModelInput({ ...clone, total_media: 99 }),
      "total_media"
    );
    const posts = clone.posts.map((post, index) =>
      index === 0
        ? {
            ...post,
            media: [{ ...post.media[0], content_path: "/media/%2e%2e" }]
          }
        : post
    );
    expectFieldPathError(
      () => parseCloneSiteModelInput({ ...clone, posts }),
      "posts[0].media[0].content_path"
    );
  });

  it("rejects unsupported future major versions", () => {
    const bad = { ...base(), contract_version: "site-bundle/2.0.0" };
    const err = expectFieldPathError(() => parseSiteBundle(bad), "contract_version");
    expect(err.code).toBe("unsupported_version");
  });

  it("rejects unknown minor within major without silent accept", () => {
    const bad = { ...base(), contract_version: "site-bundle/1.9.9" };
    expectFieldPathError(() => parseSiteBundle(bad), "contract_version");
  });

  it("does not echo secrets or payloads in errors", () => {
    const secret = "sk_live_SUPER_SECRET_TOKEN_DO_NOT_LEAK";
    const bad = {
      site_id: "s",
      creator_id: "c",
      generated_at: "2026-01-01T00:00:00.000Z",
      base_url: "/",
      creator: { display_name: "x", handle: "x" },
      theme: {
        color_scheme: "dark",
        paywall_style: "blur",
        hero: { title: "t" }
      },
      demo_personas: [],
      tiers: [],
      posts: "not-an-array",
      total_media: 0,
      api_key: secret,
      password: "hunter2"
    };
    try {
      parseSiteBundle(bad);
      expect.unreachable("should throw");
    } catch (err) {
      const msg = String(err);
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain("hunter2");
      expect(msg).not.toContain("api_key");
      expect(msg).toContain("posts");
    }
  });

  it.each(["../escape", "..", ".", "id/child", "id\\child", "id%2fchild", "id%2e%2echild"])(
    "rejects path-shaped site IDs: %s",
    (siteId) => {
      expectFieldPathError(() => parseSiteBundle({ ...base(), site_id: siteId }), "site_id");
    }
  );

  it("rejects path-shaped creator, tier, post, media, persona and access tier IDs", () => {
    const good = base();
    const cases: Array<[unknown, string]> = [
      [{ ...good, creator_id: "../creator" }, "creator_id"],
      [
        { ...good, tiers: [{ ...good.tiers[0], tier_id: "tier/escape" }, good.tiers[1]] },
        "tiers[0].tier_id"
      ],
      [
        { ...good, posts: [{ ...good.posts[0], post_id: "post\\escape" }, ...good.posts.slice(1)] },
        "posts[0].post_id"
      ],
      [
        {
          ...good,
          posts: [
            {
              ...good.posts[0],
              media: [{ ...good.posts[0].media[0], media_id: "media%2fescape" }]
            },
            ...good.posts.slice(1)
          ]
        },
        "posts[0].media[0].media_id"
      ],
      [
        {
          ...good,
          demo_personas: [
            { ...good.demo_personas[0], id: "persona/escape" },
            ...good.demo_personas.slice(1)
          ]
        },
        "demo_personas[0].id"
      ],
      [
        {
          ...good,
          posts: good.posts.map((post, index) =>
            index === 2
              ? { ...post, access: { ...post.access, tier_ids: ["tier%5cescape"] } }
              : post
          )
        },
        "posts[2].access.tier_ids[0]"
      ]
    ];
    for (const [input, fieldPath] of cases) {
      expectFieldPathError(() => parseSiteBundle(input), fieldPath);
    }
  });

  it.each([
    "nested/slug",
    "nested\\slug",
    ".",
    "..",
    "post?preview=1",
    "post#fragment",
    "%2e%2e",
    "%2fetc",
    "has space"
  ])("rejects unsafe route slugs: %s", (slug) => {
    const good = base();
    const posts = [{ ...good.posts[0], slug }, ...good.posts.slice(1)];
    expectFieldPathError(() => parseSiteBundle({ ...good, posts }), "posts[0].slug");
  });

  it("accepts safely decoded Unicode slug characters", () => {
    const good = base();
    const posts = [{ ...good.posts[0], slug: "作品-été.2026" }, ...good.posts.slice(1)];
    expect(parseSiteBundle({ ...good, posts }).posts[0].slug).toBe("作品-été.2026");
  });

  it("rejects path-shaped creator handles and output slugs before filesystem joins", () => {
    const good = base();
    expectFieldPathError(
      () =>
        parseSiteBundle({
          ...good,
          creator: { ...good.creator, handle: "../escape" }
        }),
      "creator.handle"
    );
    const escaped = join(PACKAGE_ROOT, "eh-001-escape-proof");
    expect(existsSync(escaped)).toBe(false);
    expectFieldPathError(
      () =>
        fillTemplate({
          bundle: good,
          slug: "../eh-001-escape-proof",
          clean: true
        }),
      "slug"
    );
    expect(existsSync(escaped)).toBe(false);
  });

  it.each([
    "../secret",
    "/media/../../secret",
    "/media/a/secret.jpg",
    "/media/%2e%2e",
    "/media/%2fetc",
    "/media/a%5cb.jpg",
    "/media/a.jpg?token=secret",
    "/media/a.jpg#x",
    "https://example.test/a.jpg",
    "/arbitrary/path"
  ])("rejects unsafe media content paths without echoing values: %s", (contentPath) => {
    const good = base();
    const posts = good.posts.map((post, index) =>
      index === 0
        ? {
            ...post,
            media: [{ ...post.media[0], content_path: contentPath }]
          }
        : post
    );
    const err = expectFieldPathError(
      () => parseSiteBundle({ ...good, posts }),
      "posts[0].media[0].content_path"
    );
    expect(err.message).not.toContain(contentPath);
  });

  it("fillTemplate rejects unsafe content paths before media copy can escape", () => {
    const good = base();
    const posts = good.posts.map((post, index) =>
      index === 0
        ? {
            ...post,
            media: [{ ...post.media[0], content_path: "/media/../../escape.svg" }]
          }
        : post
    );
    expectFieldPathError(
      () =>
        fillTemplate({
          bundle: { ...good, posts },
          slug: "eh-001-content-path-escape-proof",
          clean: true
        }),
      "posts[0].media[0].content_path"
    );
  });

  it("accepts only the two supported media path families", () => {
    const good = base();
    const relayPath =
      "/api/v1/export/media/cr_escape_demo/m_public/content";
    const posts = good.posts.map((post, index) =>
      index === 0
        ? { ...post, media: [{ ...post.media[0], content_path: relayPath }] }
        : post
    );
    expect(parseSiteBundle({ ...good, posts }).posts[0].media[0].content_path).toBe(
      relayPath
    );
    expect(base().posts[0].media[0].content_path).toBe("/media/m_public.svg");
  });

  it.each([
    ["generated_at", "not-a-date"],
    ["generated_at", "2026-02-30T12:00:00Z"]
  ] as const)("rejects invalid %s timestamps", (field, value) => {
    expectFieldPathError(() => parseSiteBundle({ ...base(), [field]: value }), field);
  });

  it("rejects invalid nested published_at timestamps", () => {
    const good = base();
    const posts = [
      { ...good.posts[0], published_at: "2026-13-01T12:00:00Z" },
      ...good.posts.slice(1)
    ];
    expectFieldPathError(
      () => parseSiteBundle({ ...good, posts }),
      "posts[0].published_at"
    );
  });

  it("requires total_media to equal post media reference count", () => {
    expectFieldPathError(
      () => parseSiteBundle({ ...base(), total_media: 99 }),
      "total_media"
    );
  });

  it("rejects duplicate tier IDs", () => {
    const good = base();
    expectFieldPathError(
      () => parseSiteBundle({ ...good, tiers: [...good.tiers, good.tiers[0]] }),
      `tiers[${good.tiers.length}].tier_id`
    );
  });

  it("rejects duplicate post IDs and slugs", () => {
    const good = base();
    const duplicateId = [
      good.posts[0],
      { ...good.posts[1], post_id: good.posts[0].post_id },
      good.posts[2]
    ];
    expectFieldPathError(
      () => parseSiteBundle({ ...good, posts: duplicateId }),
      "posts[1].post_id"
    );
    const duplicateSlug = [
      good.posts[0],
      { ...good.posts[1], slug: good.posts[0].slug },
      good.posts[2]
    ];
    expectFieldPathError(
      () => parseSiteBundle({ ...good, posts: duplicateSlug }),
      "posts[1].slug"
    );
  });

  it("rejects duplicate media IDs within a post", () => {
    const good = base();
    const posts = [
      { ...good.posts[0], media: [good.posts[0].media[0], good.posts[0].media[0]] },
      ...good.posts.slice(1)
    ];
    expectFieldPathError(
      () => parseSiteBundle({ ...good, posts, total_media: 4 }),
      "posts[0].media[1].media_id"
    );
  });

  it("rejects duplicate persona IDs", () => {
    const good = base();
    const personas = [
      good.demo_personas[0],
      { ...good.demo_personas[1], id: good.demo_personas[0].id },
      ...good.demo_personas.slice(2)
    ];
    expectFieldPathError(
      () => parseSiteBundle({ ...good, demo_personas: personas }),
      "demo_personas[1].id"
    );
  });

  it("rejects tier_gated references absent from the catalog, including Relay sentinels", () => {
    const good = base();
    for (const tierId of ["missing_tier", "relay_tier_all_patrons"]) {
      const posts = good.posts.map((post, index) =>
        index === 2
          ? { ...post, access: { ...post.access, tier_ids: [tierId] } }
          : post
      );
      expectFieldPathError(
        () => parseSiteBundle({ ...good, posts }),
        "posts[2].access.tier_ids[0]"
      );
    }
  });

  it("never returns normalized data after any accumulated field error", () => {
    const good = base();
    const malformed = {
      ...good,
      creator: { ...good.creator, display_name: "" },
      total_media: 999
    };
    expect(() => parseSiteBundle(malformed)).toThrow(ContractValidationError);
  });
});

describe("preview access semantics (tier-rules alignment)", () => {
  const tiers: CloneTierRule[] = [
    {
      tier_id: "patreon_tier_free",
      title: "Free",
      access_level: "tier_gated",
      amount_cents: 0
    },
    {
      tier_id: "patreon_tier_basic",
      title: "Basic",
      access_level: "tier_gated",
      amount_cents: 500
    },
    {
      tier_id: "patreon_tier_advanced",
      title: "Advanced",
      access_level: "tier_gated",
      amount_cents: 1000
    }
  ];
  const catalog = buildTierCatalog(tiers);

  it("allows public for everyone", () => {
    expect(canAccessPost({ level: "public", tier_ids: [] }, [], catalog)).toBe(true);
    expect(canAccessPost({ level: "public", tier_ids: [] }, ["patreon_tier_free"], catalog)).toBe(
      true
    );
  });

  it("member_only requires paid tier when catalog exists", () => {
    const access = { level: "member_only" as const, tier_ids: [] };
    expect(canAccessPost(access, [], catalog)).toBe(false);
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(false);
    expect(canAccessPost(access, ["patreon_tier_basic"], catalog)).toBe(true);
  });

  it("excludes free followers and free tier from paid sets", () => {
    expect(paidUserTierIds(["patreon_tier_free", "patreon_tier_basic"], catalog)).toEqual([
      "patreon_tier_basic"
    ]);
    expect(isFreeTier(catalog.patreon_tier_free)).toBe(true);
  });

  it("tier_gated exact match and tier-or-higher", () => {
    const access = {
      level: "tier_gated" as const,
      tier_ids: ["patreon_tier_basic"],
      match_mode: "tier_or_higher" as const
    };
    expect(canAccessPost(access, ["patreon_tier_basic"], catalog)).toBe(true);
    expect(canAccessPost(access, ["patreon_tier_advanced"], catalog)).toBe(true);
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(false);
    expect(
      canAccessPost(
        { ...access, match_mode: "exact" },
        ["patreon_tier_advanced"],
        catalog
      )
    ).toBe(false);
  });

  it("allows explicit free-tier requirement via exact id", () => {
    const access = {
      level: "tier_gated" as const,
      tier_ids: ["patreon_tier_free"],
      match_mode: "tier_or_higher" as const
    };
    expect(canAccessPost(access, ["patreon_tier_free"], catalog)).toBe(true);
  });

  it("unknown catalog tier ids are kept as paid (catalog lag)", () => {
    expect(paidUserTierIds(["unknown_t"], catalog)).toEqual(["unknown_t"]);
    expect(
      canAccessPost({ level: "member_only", tier_ids: [] }, ["unknown_t"], catalog)
    ).toBe(true);
  });

  it("legacy no-catalog behavior: any tier id satisfies member_only (v0 compatibility)", () => {
    // Compatibility rule: without catalog data, behave like pre-PE Escape Hatch v0
    // (cannot safely classify free vs paid).
    expect(canAccessPost({ level: "member_only", tier_ids: [] }, ["free_looking"])).toBe(
      true
    );
    expect(canAccessPost({ level: "member_only", tier_ids: [] }, [])).toBe(false);
  });

  it("legacy fixtures without amount_cents keep exact-id tier_gated behavior", () => {
    const bundle = parseSiteBundle(readFixtureJson("sample.bundle.json"));
    const publicP = bundle.demo_personas.find((p) => p.id === "public")!;
    const silver = bundle.demo_personas.find((p) => p.id === "tier:t_silver")!;
    const gold = bundle.demo_personas.find((p) => p.id === "tier:t_gold")!;
    const goldPost = bundle.posts.find((p) => p.post_id === "p_gold")!;
    const members = bundle.posts.find((p) => p.post_id === "p_members")!;

    expect(canViewPost(goldPost, publicP)).toBe(false);
    expect(canViewPost(goldPost, silver)).toBe(false);
    expect(canViewPost(goldPost, gold)).toBe(true);
    expect(canViewPost(members, publicP)).toBe(false);
    expect(canViewPost(members, gold)).toBe(true);
  });

  it("canViewPost uses persona tier_catalog for higher-tier unlock", () => {
    const persona: DemoPersona = {
      id: "advanced",
      label: "Advanced",
      tier_ids: ["patreon_tier_advanced"],
      tier_catalog: tiers
    };
    const post = {
      post_id: "p",
      slug: "s",
      title: "t",
      published_at: "2026-01-01T00:00:00Z",
      tag_ids: [],
      access: {
        level: "tier_gated" as const,
        tier_ids: ["patreon_tier_basic"],
        match_mode: "tier_or_higher" as const
      },
      media: []
    };
    expect(canViewPost(post, persona)).toBe(true);
  });
});

describe("canonical tier-rules compatibility", () => {
  it("matches src/clone/tier-rules on sanitized cases", () => {
    // Import Relay canon at runtime so package tests stay portable when dist is present.
    const tierRulesPath = join(PACKAGE_ROOT, "..", "..", "src", "clone", "tier-rules.ts");
    expect(existsSync(tierRulesPath)).toBe(true);

    // Acceptance order requires root `npm run build` first. Never self-compare:
    // missing Relay dist is a hard, actionable parity-test failure.
    const distPath = join(
      PACKAGE_ROOT,
      "..",
      "..",
      "dist",
      "src",
      "clone",
      "tier-rules.js"
    );
    if (!existsSync(distPath)) {
      throw new Error(
        `Relay tier-rules dist missing at ${distPath}; run \`npm run build\` at repository root before package tests`
      );
    }
    const relay: {
      canAccessPost: typeof canAccessPost;
      isFreeTier: typeof isFreeTier;
      paidUserTierIds: typeof paidUserTierIds;
      tierFloorCents: typeof tierFloorCents;
      userMeetsTierGatesWithOrdering: typeof userMeetsTierGatesWithOrdering;
    } = require(distPath);

    const catalogRows = {
      patreon_tier_free: {
        tier_id: "patreon_tier_free",
        creator_id: "c",
        campaign_id: "camp",
        title: "Free",
        amount_cents: 0,
        upstream_updated_at: "2026-01-01T00:00:00.000Z",
        version_seq: 1
      },
      patreon_tier_basic: {
        tier_id: "patreon_tier_basic",
        creator_id: "c",
        campaign_id: "camp",
        title: "Basic",
        amount_cents: 500,
        upstream_updated_at: "2026-01-01T00:00:00.000Z",
        version_seq: 1
      },
      patreon_tier_advanced: {
        tier_id: "patreon_tier_advanced",
        creator_id: "c",
        campaign_id: "camp",
        title: "Advanced",
        amount_cents: 1000,
        upstream_updated_at: "2026-01-01T00:00:00.000Z",
        version_seq: 1
      }
    };

    const previewCatalog = buildTierCatalog([
      {
        tier_id: "patreon_tier_free",
        title: "Free",
        access_level: "tier_gated",
        amount_cents: 0
      },
      {
        tier_id: "patreon_tier_basic",
        title: "Basic",
        access_level: "tier_gated",
        amount_cents: 500
      },
      {
        tier_id: "patreon_tier_advanced",
        title: "Advanced",
        access_level: "tier_gated",
        amount_cents: 1000
      }
    ]);

    const cases: Array<{
      access: { level: "public" | "member_only" | "tier_gated"; tier_ids: string[] };
      user: string[];
    }> = [
      { access: { level: "public", tier_ids: [] }, user: [] },
      { access: { level: "member_only", tier_ids: [] }, user: ["patreon_tier_free"] },
      { access: { level: "member_only", tier_ids: [] }, user: ["patreon_tier_basic"] },
      { access: { level: "tier_gated", tier_ids: ["patreon_tier_basic"] }, user: ["patreon_tier_advanced"] },
      { access: { level: "tier_gated", tier_ids: ["patreon_tier_basic"] }, user: ["patreon_tier_free"] },
      { access: { level: "tier_gated", tier_ids: ["patreon_tier_free"] }, user: ["patreon_tier_free"] },
      { access: { level: "member_only", tier_ids: [] }, user: ["unknown_t"] }
    ];

    for (const c of cases) {
      const eh = canAccessPost(c.access, c.user, previewCatalog);
      const canon = relay.canAccessPost(c.access, c.user, catalogRows);
      expect(eh).toBe(canon);
    }

    expect(isFreeTier(previewCatalog.patreon_tier_free)).toBe(
      relay.isFreeTier(catalogRows.patreon_tier_free)
    );
    expect(paidUserTierIds(["patreon_tier_free", "patreon_tier_basic"], previewCatalog)).toEqual(
      relay.paidUserTierIds(["patreon_tier_free", "patreon_tier_basic"], catalogRows)
    );
    expect(tierFloorCents(previewCatalog, "patreon_tier_basic")).toBe(
      relay.tierFloorCents(catalogRows, "patreon_tier_basic")
    );
    expect(
      userMeetsTierGatesWithOrdering(
        ["patreon_tier_basic"],
        ["patreon_tier_advanced"],
        previewCatalog
      )
    ).toBe(
      relay.userMeetsTierGatesWithOrdering(
        ["patreon_tier_basic"],
        ["patreon_tier_advanced"],
        catalogRows
      )
    );
  });
});

describe("generated contract embedding", () => {
  it("fillTemplate embeds a byte-identical contracts module from the canonical source", () => {
    const legacy = readFixtureJson("sample.bundle.json");
    const result = fillTemplate({
      bundle: legacy,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "eh-001-contract-parity",
      clean: true
    });
    const canonical = readFileSync(CONTRACTS_SOURCE_PATH, "utf8");
    const embedded = readFileSync(result.contractsPath, "utf8");
    expect(embedded).toBe(canonical);
    expect(result.bundle.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);

    const site = JSON.parse(readFileSync(result.siteJsonPath, "utf8"));
    expect(site.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);
  });

  it("generated contracts module runtime-validates site.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eh-001-gen-"));
    try {
      const contractsPath = embedContractsModule(dir);
      const mod = await import(pathToFileURL(contractsPath).href);
      const good = parseSiteBundle(readFixtureJson("sample.bundle.json"));
      writeFileSync(join(dir, "site.json"), serializeSiteBundle(good), "utf8");
      const loaded = mod.parseSiteBundle(
        JSON.parse(readFileSync(join(dir, "site.json"), "utf8"))
      );
      expect(loaded.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);

      expect(() =>
        mod.parseSiteBundle({ ...good, contract_version: "site-bundle/9.0.0" })
      ).toThrow(/unsupported contract version/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fromClone and fillTemplate reproducibility", () => {
  it("fromClone normalizes legacy clone-site and rewrites media paths", () => {
    const clone = readFixtureJson("clone-site.json");
    const bundle = fromClone({
      clone,
      creator: { display_name: "Demo", handle: "demo" }
    });
    expect(bundle.contract_version).toBe(SITE_BUNDLE_CONTRACT_VERSION);
    expect(bundle.generated_at).toBe("2026-07-13T20:00:00.000Z");
    expect(bundle.posts[0].media[0].content_path).toBe("/media/m_api.png");
    expect(bundle.posts[1].media[0].content_path).toBe("/media/m_gold2.jpg");
  });

  it("fillTemplate remains reproducible for sample bundle", () => {
    const bundle = readFixtureJson("sample.bundle.json");
    const a = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "eh-001-repro-a",
      clean: true
    });
    const b = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "eh-001-repro-b",
      clean: true
    });
    const siteA = readFileSync(a.siteJsonPath, "utf8");
    const siteB = readFileSync(b.siteJsonPath, "utf8");
    expect(siteA).toBe(siteB);
    expect(readFileSync(a.contractsPath, "utf8")).toBe(
      readFileSync(b.contractsPath, "utf8")
    );
  });
});
