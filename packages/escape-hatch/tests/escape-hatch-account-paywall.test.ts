/**
 * EH-034 Account / paywall UX: locked honesty, soft-persona blocked copy,
 * no client-only unlock, status slice advance.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { fillTemplate } from "../src/fill-template.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";
import {
  paywallCopyForReason,
  paywallTeaserHeadline
} from "../template/lib/paywall/copy.js";
import {
  resolveVisitorMediaSrc,
  visitorMediaApiPath
} from "../template/lib/media/visitor-src.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_BUNDLE = join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
const MEDIA_DIR = join(PACKAGE_ROOT, "fixtures", "media");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("EH-034 status + manifest", () => {
  it("advances slice to EH-071 with next EH-072 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-071");
    expect(status.slice).toBe("EH-071");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-072");
    expect(status.nextSlice.title).toMatch(/email|transactional/i);
    const cap = status.capabilities.find((c) => c.id === "account-paywall-ux");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/EH-034|\/account|PaywallOverlay|productionSafe remains false/i);
    expect(cap?.nextSlice).toBe("EH-072");
    expect(
      status.blockers.some((b) => /Account\/paywall UX.*EH-034/i.test(b))
    ).toBe(false);
    expect(
      status.blockers.some((b) => /browser personas|security review/i.test(b))
    ).toBe(true);
  });

  it("stamps generated kit with EH-034 and hard_paywall true", () => {
    const result = fillTemplate({
      bundle: JSON.parse(readFileSync(SAMPLE_BUNDLE, "utf8")),
      slug: `eh-034-${Date.now()}`,
      mediaSourceDir: MEDIA_DIR,
      clean: true
    });
    tempDirs.push(result.outDir);
    const manifest = JSON.parse(
      readFileSync(join(result.outDir, "escape-hatch.manifest.json"), "utf8")
    ) as {
      slice: string;
      productionSafe: boolean;
      feature_flags: Record<string, boolean>;
    };
    expect(manifest.slice).toBe("EH-071");
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.feature_flags.hard_paywall).toBe(true);
    expect(existsSync(join(result.outDir, "app/account/page.tsx"))).toBe(true);
    expect(existsSync(join(result.outDir, "components/PaywallOverlay.tsx"))).toBe(
      true
    );
    expect(existsSync(join(result.outDir, "lib/paywall/copy.ts"))).toBe(true);
    const accountPage = readFileSync(
      join(result.outDir, "app/account/page.tsx"),
      "utf8"
    );
    expect(accountPage).toMatch(/PatronChrome/);
    expect(accountPage).not.toMatch(/ConsoleNav/);
    const loginPage = readFileSync(join(result.outDir, "app/login/page.tsx"), "utf8");
    expect(loginPage).toMatch(/PatronChrome/);
    expect(loginPage).not.toMatch(/ConsoleNav/);
    const ops = readFileSync(join(result.outDir, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/EH-034|Account \/ paywall/i);
    expect(ops).toMatch(/Soft persona/i);
    const ownership = readFileSync(join(result.outDir, "OWNERSHIP.md"), "utf8");
    expect(ownership).toMatch(/EH-034|paywall UX/i);
  });
});

describe("EH-034 paywall honesty", () => {
  it("does not unlock without server allow (evaluator)", () => {
    const denied = evaluateAccess({
      subject: { kind: "anonymous" },
      resource: {
        type: "post",
        id: "p1",
        siteId: "site_eh",
        accessLevel: "member_only",
        tierIds: [],
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      provider: "supabase",
      nowMs: Date.parse("2026-07-22T12:00:00.000Z")
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("anonymous_denied");

    const copy = paywallCopyForReason({
      reason: denied.reason,
      allowed: denied.allowed,
      audience: "anonymous"
    });
    expect(copy.deniedAnnouncement).toMatch(/locked|Sign in/i);
    expect(copy.primaryHref).toBe("/login");
  });

  it("surfaces soft_persona_blocked when provider is configured", () => {
    const blocked = evaluateAccess({
      subject: {
        kind: "soft_persona",
        personaId: "patron",
        tierIds: ["t_all"]
      },
      resource: {
        type: "post",
        id: "p1",
        siteId: "site_eh",
        accessLevel: "member_only",
        tierIds: [],
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      provider: "portable",
      nowMs: Date.parse("2026-07-22T12:00:00.000Z")
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("soft_persona_blocked");

    const copy = paywallCopyForReason({
      reason: blocked.reason,
      allowed: false,
      audience: "soft_persona_blocked"
    });
    expect(copy.headline).toMatch(/Sign in/i);
    expect(copy.honestyNote).toMatch(/never elevates|Path A\/B/i);
    expect(paywallTeaserHeadline("soft_persona_blocked")).toMatch(/Sign in/i);
  });

  it("keeps staff override copy honest (not fake patron)", () => {
    const copy = paywallCopyForReason({
      reason: "staff_override",
      allowed: true,
      audience: "staff"
    });
    expect(copy.honestyNote).toMatch(/Staff override/i);
    expect(copy.detail).not.toMatch(/You are a patron/i);
  });

  it("resolves premium visitor src only via API path (locked callers skip)", () => {
    const api = resolveVisitorMediaSrc({
      mediaId: "m_members",
      contentPath: "/media/m_members.svg",
      accessLevel: "member_only"
    });
    expect(api).toBe(visitorMediaApiPath("m_members"));
    expect(api).toMatch(/^\/api\/media\//);
    // Public stays on static path
    expect(
      resolveVisitorMediaSrc({
        mediaId: "m_public",
        contentPath: "/media/m_public.svg",
        accessLevel: "public"
      })
    ).toBe("/media/m_public.svg");
  });
});

describe("EH-034 logout POST-only", () => {
  it("logout route rejects GET and accepts form next redirect", () => {
    const logout = readFileSync(
      join(PACKAGE_ROOT, "template/app/auth/logout/route.ts"),
      "utf8"
    );
    expect(logout).toMatch(/export async function POST/);
    expect(logout).toMatch(/export async function GET/);
    expect(logout).toMatch(/405/);
    expect(logout).toMatch(/Allow:\s*"POST"/);
    expect(logout).toMatch(/formData/);
    expect(logout).toMatch(/Logout requires POST/);
  });
});
