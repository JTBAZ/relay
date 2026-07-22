/**
 * EH-033 Private media delivery: entitlement-gated signed/proxy delivery,
 * anonymous denial, soft-persona honesty, fill layout, fixture hygiene.
 * No live R2 required — mock signer only.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { fillTemplate } from "../src/fill-template.js";
import { scanFixtureTree } from "../src/fixture-scan.js";
import { deliverMedia } from "../template/lib/media/delivery.js";
import {
  resolveMediaMode,
  isR2SigningConfigured,
  MediaConfigError,
  assertPrivateR2Ready
} from "../template/lib/media/config.js";
import { createMockMediaSigner } from "../template/lib/media/sign.js";
import { isSafeSignedRedirectUrl } from "../template/lib/media/redirect-guard.js";
import {
  buildEscapeHatchMediaObjectKey,
  isEscapeHatchMediaObjectKey
} from "../template/lib/media/keys.js";
import {
  resolveVisitorMediaSrc,
  visitorMediaApiPath
} from "../template/lib/media/visitor-src.js";
import { SOFT_PERSONA_COOKIE } from "../template/lib/media/types.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";
import { grantFromSnapshot } from "../template/lib/entitlements/merge.js";
import type { DeliverMediaSite } from "../template/lib/media/delivery.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");
const FIXTURES = join(PACKAGE_ROOT, "fixtures");

const SITE_ID = "site_eh_033";
const CREATOR_ID = "cr_eh_033";

function sampleSite(): DeliverMediaSite {
  return {
    creator_id: CREATOR_ID,
    site_id: SITE_ID,
    tiers: [
      { tier_id: "t_gold", amount_cents: 1000, title: "Gold", currency: "USD" }
    ],
    demo_personas: [
      { id: "public", tier_ids: [] },
      { id: "patron", tier_ids: ["t_all"] },
      { id: "gold", tier_ids: ["t_gold"] }
    ],
    posts: [
      {
        post_id: "p_public",
        access: { level: "public", tier_ids: [] },
        media: [{ media_id: "m_public", content_path: "/media/m_public.svg" }]
      },
      {
        post_id: "p_members",
        access: { level: "member_only", tier_ids: [] },
        media: [{ media_id: "m_members", content_path: "/media/m_members.svg" }]
      },
      {
        post_id: "p_gold",
        access: { level: "tier_gated", tier_ids: ["t_gold"], match_mode: "exact" },
        media: [{ media_id: "m_gold", content_path: "/media/m_gold.svg" }]
      }
    ]
  };
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const v = vars[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const key of Object.keys(vars)) {
        const v = prev[key];
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    });
}

describe("EH-033 status", () => {
  it("advances slice to EH-034 with next EH-040 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-034");
    expect(status.slice).toBe("EH-034");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-040");
    expect(status.nextSlice.title).toMatch(/Patreon|OAuth/i);
    expect(
      status.blockers.some((b) => /Milestone 3|security review|browser personas/i.test(b))
    ).toBe(true);

    const media = status.capabilities.find(
      (c) => c.id === "private-media-delivery"
    );
    expect(media?.state).toBe("preview_only");
    expect(media?.evidence).toMatch(/evaluateAccess|signed|local_private/i);
    expect(media?.nextSlice).toBe("EH-040");
  });
});

describe("EH-033 keys and visitor paths", () => {
  it("builds opaque object keys and visitor API paths", () => {
    const key = buildEscapeHatchMediaObjectKey(CREATOR_ID, SITE_ID, "m_gold");
    expect(isEscapeHatchMediaObjectKey(key)).toBe(true);
    expect(key).not.toMatch(/public\/media/i);
    expect(visitorMediaApiPath("m_gold")).toBe("/api/media/m_gold");
    expect(
      resolveVisitorMediaSrc({
        mediaId: "m_gold",
        contentPath: "/media/m_gold.svg",
        accessLevel: "tier_gated"
      })
    ).toBe("/api/media/m_gold");
    expect(
      resolveVisitorMediaSrc({
        mediaId: "m_public",
        contentPath: "/media/m_public.svg",
        accessLevel: "public"
      })
    ).toBe("/media/m_public.svg");
  });
});

describe("EH-033 media mode config", () => {
  it("defaults to local_private without R2 and fails closed for private_r2 placeholders", async () => {
    await withEnv(
      {
        ESCAPE_HATCH_MEDIA_MODE: undefined,
        R2_ENDPOINT: undefined,
        R2_BUCKET: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined
      },
      () => {
        expect(resolveMediaMode()).toBe("local_private");
        expect(isR2SigningConfigured()).toBe(false);
      }
    );

    await withEnv(
      {
        ESCAPE_HATCH_MEDIA_MODE: "private_r2",
        R2_ENDPOINT: "https://your_account.r2.cloudflarestorage.com",
        R2_BUCKET: "replace_me",
        R2_ACCESS_KEY_ID: "changeme",
        R2_SECRET_ACCESS_KEY: "changeme"
      },
      () => {
        expect(() => assertPrivateR2Ready()).toThrow(MediaConfigError);
      }
    );
  });
});

describe("EH-033 deliverMedia access matrix", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "eh-033-media-"));
    const privateDir = join(cwd, "data", "private-media");
    mkdirSync(privateDir, { recursive: true });
    writeFileSync(join(privateDir, "m_members.svg"), "<svg id='members'/>", "utf8");
    writeFileSync(join(privateDir, "m_gold.svg"), "<svg id='gold'/>", "utf8");
    writeFileSync(join(privateDir, "m_public.svg"), "<svg id='public'/>", "utf8");
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("denies anonymous premium bytes", async () => {
    await withEnv({ ESCAPE_HATCH_MEDIA_MODE: "local_private" }, async () => {
      const denied = await deliverMedia({
        site: sampleSite(),
        mediaId: "m_members",
        cwd
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.status).toBe(401);
        expect(denied.reason).toMatch(/anonymous_denied/i);
      }
    });
  });

  it("allows soft persona preview when provider is none", async () => {
    await withEnv(
      {
        ESCAPE_HATCH_MEDIA_MODE: "local_private",
        ESCAPE_HATCH_IDENTITY_PROVIDER: "none"
      },
      async () => {
        const allowed = await deliverMedia({
          site: sampleSite(),
          mediaId: "m_members",
          cwd,
          cookieHeader: `${SOFT_PERSONA_COOKIE}=patron`
        });
        expect(allowed.ok).toBe(true);
        if (allowed.ok && allowed.kind === "stream") {
          expect(allowed.body.toString("utf8")).toContain("members");
          expect(allowed.cacheControl).toMatch(/no-store/i);
        }
      }
    );
  });

  it("blocks soft persona when supabase provider is configured", async () => {
    await withEnv(
      {
        ESCAPE_HATCH_MEDIA_MODE: "local_private",
        ESCAPE_HATCH_IDENTITY_PROVIDER: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://eh033proj.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          "eh_ci_anon_key_not_a_secret_aaaaaaaaaaaaaaaaaaaaaaaa"
      },
      async () => {
        const denied = await deliverMedia({
          site: sampleSite(),
          mediaId: "m_members",
          cwd,
          cookieHeader: `${SOFT_PERSONA_COOKIE}=patron`
        });
        expect(denied.ok).toBe(false);
        if (!denied.ok) {
          expect(denied.reason).toMatch(/soft_persona_blocked|anonymous_denied/i);
        }
      }
    );
  });

  it("denies expired entitlement via evaluateAccess for media resources", () => {
    const nowMs = Date.parse("2026-07-22T12:00:00.000Z");
    const grant = grantFromSnapshot({
      source: "manual",
      tierIds: ["t_gold"],
      observedAt: "2026-01-01T00:00:00.000Z",
      staleAfter: "2026-12-31T00:00:00.000Z",
      expiresAt: "2026-06-01T00:00:00.000Z",
      reason: "expired grant"
    });
    const result = evaluateAccess({
      subject: {
        kind: "member",
        userId: "u1",
        provider: "supabase",
        role: "patron",
        siteId: SITE_ID
      },
      resource: {
        type: "media",
        id: "m_gold",
        siteId: SITE_ID,
        accessLevel: "tier_gated",
        tierIds: ["t_gold"],
        matchMode: "exact"
      },
      grants: [grant],
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("entitlement_expired");
  });

  it("mints mock signed redirect for private_r2 with allowlisted host", async () => {
    await withEnv(
      {
        ESCAPE_HATCH_MEDIA_MODE: "private_r2",
        ESCAPE_HATCH_IDENTITY_PROVIDER: "none",
        R2_ENDPOINT: "https://media.fixture.example",
        R2_BUCKET: "eh-033-bucket",
        R2_ACCESS_KEY_ID: "eh033_access_key_not_live_aaaaaaaa",
        R2_SECRET_ACCESS_KEY: "eh033_secret_key_not_live_bbbbbbbbbbbb",
        ESCAPE_HATCH_MEDIA_SIGNER: "mock"
      },
      async () => {
        const signer = createMockMediaSigner({
          baseUrl: "https://media.fixture.example"
        });
        const result = await deliverMedia({
          site: sampleSite(),
          mediaId: "m_members",
          cwd,
          cookieHeader: `${SOFT_PERSONA_COOKIE}=patron`,
          signer
        });
        expect(result.ok).toBe(true);
        if (result.ok && result.kind === "redirect") {
          expect(isSafeSignedRedirectUrl(result.url)).toBe(true);
          expect(result.url).toMatch(/^https:\/\/media\.fixture\.example\//);
          expect(result.cacheControl).toMatch(/no-store/i);
        }
      }
    );
  });

  it("rejects open redirect to non-allowlisted signed hosts", () => {
    expect(
      isSafeSignedRedirectUrl("https://evil.example/object/x?sig=1")
    ).toBe(false);
    expect(
      isSafeSignedRedirectUrl("https://media.fixture.example/object/x")
    ).toBe(true);
  });

  it("denies missing media id and unknown media", async () => {
    await withEnv({ ESCAPE_HATCH_MEDIA_MODE: "local_private" }, async () => {
      const missing = await deliverMedia({
        site: sampleSite(),
        mediaId: "",
        cwd
      });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.status).toBe(400);

      const unknown = await deliverMedia({
        site: sampleSite(),
        mediaId: "m_nope",
        cwd
      });
      expect(unknown.ok).toBe(false);
      if (!unknown.ok) expect(unknown.status).toBe(404);
    });
  });
});

describe("EH-033 fillTemplate private layout", () => {
  it("does not stage premium originals under public/media by default", () => {
    const bundle = JSON.parse(
      readFileSync(join(FIXTURES, "sample.bundle.json"), "utf8")
    );
    const result = fillTemplate({
      bundle,
      mediaSourceDir: join(FIXTURES, "media"),
      slug: "eh-033-private-layout",
      clean: true
    });

    expect(existsSync(join(result.outDir, "public", "media", "m_public.svg"))).toBe(
      true
    );
    expect(
      existsSync(join(result.outDir, "public", "media", "m_members.svg"))
    ).toBe(false);
    expect(existsSync(join(result.outDir, "public", "media", "m_gold.svg"))).toBe(
      false
    );
    expect(
      existsSync(join(result.outDir, "data", "private-media", "m_members.svg"))
    ).toBe(true);
    expect(
      existsSync(join(result.outDir, "data", "private-media", "m_gold.svg"))
    ).toBe(true);
    expect(existsSync(join(result.outDir, "app", "api", "media", "[mediaId]", "route.ts"))).toBe(
      true
    );
    expect(existsSync(join(result.outDir, "lib", "media", "delivery.ts"))).toBe(
      true
    );

    const layout = JSON.parse(
      readFileSync(join(result.outDir, "data", "media-layout.json"), "utf8")
    ) as { layout: string; production_safe: boolean };
    expect(layout.layout).toBe("private");
    expect(layout.production_safe).toBe(false);

    const manifest = JSON.parse(
      readFileSync(result.manifestPath, "utf8")
    ) as {
      slice: string;
      productionSafe: boolean;
      feature_flags: { signed_media_delivery: boolean };
    };
    expect(manifest.slice).toBe("EH-034");
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.feature_flags.signed_media_delivery).toBe(true);
  });
});

describe("EH-033 template surfaces", () => {
  it("documents media mode and R2 env names without secrets", () => {
    const example = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(example).toMatch(/ESCAPE_HATCH_MEDIA_MODE/);
    expect(example).toMatch(/R2_SECRET_ACCESS_KEY=/);
    expect(example).toMatch(/NEVER commit real secrets/i);
    expect(example).not.toMatch(/sk_live_|AKIA[0-9A-Z]{16}/);

    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/Private media delivery \(EH-033\)/);
    expect(ops).toMatch(/local_private|private_r2/);
    expect(ops).toMatch(/allowlisted|no-store|evaluateAccess/i);

    const route = readFileSync(
      join(TEMPLATE, "app", "api", "media", "[mediaId]", "route.ts"),
      "utf8"
    );
    expect(route).toMatch(/deliverMedia/);
    expect(route).toMatch(/private, no-store/);
  });
});

describe("EH-033 fixture scan still clean", () => {
  it("fixtures contain no live secrets or long-lived signed credential URLs", () => {
    const result = scanFixtureTree(FIXTURES);
    expect(result.findings).toEqual([]);
    const sample = readFileSync(join(FIXTURES, "sample.bundle.json"), "utf8");
    expect(sample).not.toMatch(/X-Amz-Signature=|X-Amz-Credential=AKIA/i);
    expect(sample).not.toMatch(/sk_live_|R2_SECRET_ACCESS_KEY\s*[:=]\s*['"][^'"]{8,}/i);
  });
});
