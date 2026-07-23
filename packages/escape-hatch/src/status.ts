/**
 * Deterministic Escape Hatch capability inventory (through EH-053).
 * No timestamps, env reads, network, or live data — informational only.
 */

export const ESCAPE_HATCH_STATUS_SCHEMA_VERSION = "escape-hatch-status/1.0.0";

export const ESCAPE_HATCH_SLICE = "EH-053";

export type CapabilityState =
  | "production_safe"
  | "preview_only"
  | "stub_only"
  | "not_implemented"
  | "reusable_relay_source";

export type CapabilityRisk = "critical" | "high" | "medium" | "low" | "informational";

export type EscapeHatchCapability = {
  id: string;
  title: string;
  state: CapabilityState;
  evidence: string;
  sourcePaths: string[];
  risk: CapabilityRisk;
  nextSlice?: string;
};

export type EscapeHatchStatus = {
  schemaVersion: typeof ESCAPE_HATCH_STATUS_SCHEMA_VERSION;
  slice: typeof ESCAPE_HATCH_SLICE;
  deliverable: "prototype_preview_only";
  productionSafe: false;
  summary: string;
  prototypeWarnings: string[];
  capabilities: EscapeHatchCapability[];
  blockers: string[];
  nextSlice: {
    id: "EH-054";
    title: string;
    focus: string[];
  };
};

const CAPABILITIES: EscapeHatchCapability[] = [
  {
    id: "cli-generator",
    title: "Prototype generator and CLI",
    state: "preview_only",
    evidence:
      "fixture, wizard, build, from-relay, from-clone, import-relay-dump, migrate-media, library-truth / parity-report, and zip subcommands materialize a standalone Next.js kit (typed env, SQL migrations + RLS, Vercel/Docker manifests, adapter surfaces, cold-gallery patron theme, native admin shell, optional Supabase Path A + portable Path B identity, EH-032 entitlement evaluator, EH-033 private media, EH-034 account/paywall UX, EH-035 visitor visual system, EH-040 creator-owned Patreon OAuth, EH-041 Relay-managed verification) plus import/migration/library-parity artifacts; suitable for local preview only.",
    sourcePaths: [
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/wizard.ts",
      "packages/escape-hatch/src/zip-kit.ts",
      "packages/escape-hatch/src/import/importer.ts",
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/library-truth/kit-io.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "generated-repository",
    title: "Generated repository chassis",
    state: "preview_only",
    evidence:
      "EH-020 chassis plus EH-030–041: package.json + Next App Router, typed lib/env.ts + .env.example (Supabase + portable + Patreon OAuth names), db/schema + db/migrations SQL including Path A RLS (0002), Path B portable identity (0003), entitlement evaluator (0004_*), and Patreon OAuth tables (0005_*) (no live DB required for next build), lib/adapters with optional Supabase/portable Auth/DB creator_oauth + relay_managed Patreon, lib/entitlements evaluator, private media delivery, account/paywall UX, cold-gallery visitor chrome, escape-hatch.manifest.json, vercel.json, Dockerfile/.dockerignore, optional loopback-only docker-compose Postgres profile (127.0.0.1:5433). Install/build from a clean directory without RELAY_* / root .env. productionSafe remains false — Milestone 3 security/browser gate, billing, and verified deploy remain open.",
    sourcePaths: [
      "packages/escape-hatch/template/package.json",
      "packages/escape-hatch/template/lib/env.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/db/migrations/0001_preview_chassis.sql",
      "packages/escape-hatch/template/db/migrations/0002_identity_rls.sql",
      "packages/escape-hatch/template/db/migrations/0003_portable_identity.sql",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_supabase.sql",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_portable.sql",
      "packages/escape-hatch/template/escape-hatch.manifest.json",
      "packages/escape-hatch/template/vercel.json",
      "packages/escape-hatch/template/Dockerfile",
      "packages/escape-hatch/template/.env.example",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/tests/escape-hatch-generated-repo.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "premium-patron-theme",
    title: "Premium patron theme",
    state: "preview_only",
    evidence:
      "EH-021 + EH-035: cold-gallery visitor theme (Outfit/Source Sans defaults, cobalt accent, media mosaic, sticky top bar) with controlled branding dials (logo, display name, intro, accent, approved type pairings, light/dark/warm schemes, gallery density, cover crop, paywall message, community CTA). PatronChrome separates visitor chrome from Hatch Console; /account and /login use visitor shell. Soft persona switch is local_preview only (provider none). Soft-gate / preview-only; productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/components/GalleryApp.tsx",
      "packages/escape-hatch/template/components/PostView.tsx",
      "packages/escape-hatch/template/components/PaywallOverlay.tsx",
      "packages/escape-hatch/template/components/PaywallTeaser.tsx",
      "packages/escape-hatch/template/components/PatronChrome.tsx",
      "packages/escape-hatch/template/components/StyleStudio.tsx",
      "packages/escape-hatch/template/app/preview/page.tsx",
      "packages/escape-hatch/template/app/p/[slug]/page.tsx",
      "packages/escape-hatch/template/app/globals.css",
      "packages/escape-hatch/template/app/theme-vars.css",
      "packages/escape-hatch/template/lib/theme.ts",
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/wizard.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/tests/escape-hatch-theme.test.ts"
    ],
    risk: "medium",
    nextSlice: "EH-054"
  },
  {
    id: "soft-persona-gate",
    title: "Soft client persona gate",
    state: "preview_only",
    evidence:
      "Soft persona switch and cookie (persona id only) appear only when identity provider is none; tiers resolve server-side from the bundle for local_preview media. When Path A/B is active, persona UI is hidden and EH-032 soft_persona_blocked denies elevation — never authorizes admin or premium bytes. productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/template/lib/access.ts",
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts",
      "packages/escape-hatch/template/lib/entitlements/evaluate.ts",
      "packages/escape-hatch/template/components/PatronChrome.tsx",
      "packages/escape-hatch/template/lib/paywall/copy.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "public-media-copy",
    title: "Generated media staging layout",
    state: "preview_only",
    evidence:
      "EH-033 default fill stages premium (member_only/tier_gated) bytes under data/private-media and public/free assets under public/media. Visitor premium delivery uses /api/media/{id} after evaluateAccess. Explicit mediaLayout=public_legacy still copies premium into public/media (residual leakage; productionSafe false). EH-012 migrate-media never treats public/media as private-read success.",
    sourcePaths: [
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/migrate/validate.ts",
      "packages/escape-hatch/template/lib/media/delivery.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "client-readable-bundle",
    title: "Public client-readable bundle and theme",
    state: "preview_only",
    evidence:
      "fill-template writes both data/site.json and data/theme.json and public/site.json and public/theme.json; the public copies are client-readable without server-side entitlement enforcement. Import provenance/local-state/report, media-migration ledger/report, library-parity report/state, and admin-attention stay under data/ only.",
    sourcePaths: [
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/template/lib/load-site.ts",
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/src/migrate/kit-io.ts",
      "packages/escape-hatch/src/library-truth/kit-io.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "duplicate-contracts",
    title: "Versioned shared contracts",
    state: "preview_only",
    evidence:
      "SiteBundle and CloneSiteModel are explicitly versioned and runtime-validated; generated apps receive a byte-identical self-contained canonical contracts module. EH-011 adds import-provenance / import-local-state / import-report; EH-012 adds media-migration-ledger/1.0.0 and media-migration-report/1.0.0; EH-013 adds library-parity-report/1.0.0 and library-truth-state/1.0.0 with fail-closed parsers. EH-021 extends EscapeHatchTheme with optional branding dials (type pairing, density, cover crop, paywall message, community CTA, logo).",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/types.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/import/types.ts",
      "packages/escape-hatch/src/migrate/types.ts",
      "packages/escape-hatch/src/migrate/validate.ts",
      "packages/escape-hatch/src/library-truth/types.ts",
      "packages/escape-hatch/src/library-truth/validate.ts",
      "packages/escape-hatch/template/lib/access.ts",
      "packages/escape-hatch/template/lib/load-site.ts"
    ],
    risk: "low"
  },
  {
    id: "fixture-coverage",
    title: "Fixture coverage (sample, clone, Patreon shapes)",
    state: "preview_only",
    evidence:
      "Fixture matrix (MATRIX.json) covers sanitized OAuth/cookie Patreon JSON, SiteBundle/Clone adaptations with branding dials, relay-dump import + media migration + library-truth parity accounting, generated-repo chassis smoke, premium patron theme branding fields, native admin shell routes against fixture data, identity/RLS SQL review tests (Supabase + portable), promoted tombstone/legacy-tier families, and deferred mature/legal enforcement stubs; secret/PII scan remains wired.",
    sourcePaths: [
      "packages/escape-hatch/fixtures/MATRIX.json",
      "packages/escape-hatch/fixtures/PROVENANCE.md",
      "packages/escape-hatch/fixtures/sample.bundle.json",
      "packages/escape-hatch/fixtures/clone-site.json",
      "packages/escape-hatch/fixtures/matrix/site-bundles/access-matrix.bundle.json",
      "packages/escape-hatch/src/fixture-scan.ts",
      "packages/escape-hatch/tests/escape-hatch-fixtures.test.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts",
      "packages/escape-hatch/tests/escape-hatch-migrate.test.ts",
      "packages/escape-hatch/tests/escape-hatch-library-truth.test.ts",
      "packages/escape-hatch/tests/escape-hatch-generated-repo.test.ts",
      "packages/escape-hatch/tests/escape-hatch-theme.test.ts",
      "packages/escape-hatch/tests/escape-hatch-admin.test.ts",
      "packages/escape-hatch/tests/escape-hatch-identity.test.ts",
      "packages/escape-hatch/tests/escape-hatch-portable-identity.test.ts",
      "tests/fixtures/patreon/oauth-list-post-text-only.json",
      "tests/fixtures/patreon/cookie-list-with-media.json"
    ],
    risk: "medium",
    nextSlice: "EH-054"
  },
  {
    id: "relay-dump-fixtures",
    title: "Relay-dump fixtures and importer tests",
    state: "preview_only",
    evidence:
      "fixtures/relay-dump/ drives import-relay-dump, migrate-media, and library-truth with checksum/byte-length verification, private-read ledger entries, and 100% accounted-for parity reporting; missing blobs remain accounted failures.",
    sourcePaths: [
      "packages/escape-hatch/fixtures/relay-dump/canonical.json",
      "packages/escape-hatch/fixtures/relay-dump/exports/cr_eh_relay/export_index.json",
      "packages/escape-hatch/src/import/load-relay-dump.ts",
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/library-truth/build-report.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts",
      "packages/escape-hatch/tests/escape-hatch-migrate.test.ts",
      "packages/escape-hatch/tests/escape-hatch-library-truth.test.ts"
    ],
    risk: "medium",
    nextSlice: "EH-054"
  },
  {
    id: "relay-canonical-reuse",
    title: "Canonical ingest, clone, and export reuse",
    state: "reusable_relay_source",
    evidence:
      "Importer and from-relay load Relay dist clone-generator against canonical and export_index inputs; canonical ingest, clone tier-rules, and export types live in repo src/ and are reused, not reimplemented here. R2 patterns are referenced only; package tests use an in-memory storage port. Generated kits do not import Relay-monorepo absolute paths.",
    sourcePaths: [
      "packages/escape-hatch/src/from-relay.ts",
      "packages/escape-hatch/src/from-clone.ts",
      "packages/escape-hatch/src/import/importer.ts",
      "packages/escape-hatch/src/migrate/r2-storage.ts",
      "src/ingest/types.ts",
      "src/ingest/canonical-store.ts",
      "src/clone/types.ts",
      "src/clone/tier-rules.ts",
      "src/export/types.ts",
      "src/storage/r2-config.ts",
      "src/storage/relay-upload-r2.ts",
      "src/storage/media-delivery-policy.ts"
    ],
    risk: "informational",
    nextSlice: "EH-054"
  },
  {
    id: "simplified-access-semantics",
    title: "Canonical-aligned preview access semantics",
    state: "preview_only",
    evidence:
      "The shared preview evaluator matches canonical paid/free, exact-tier, and tier-or-higher ordering semantics using serialized tier catalog data; soft persona remains client-only in local_preview. Server entitlement evaluation (EH-032) merges Patreon/billing/manual grants with freshness rules and does not trust client tier_ids.",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/src/library-truth/build-report.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts",
      "packages/escape-hatch/template/lib/entitlements/evaluate.ts",
      "src/clone/tier-rules.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "generated-site-identity",
    title: "Generated-site patron identity",
    state: "preview_only",
    evidence:
      "EH-030 Path A (Supabase Auth/Postgres) and EH-031 Path B (portable Postgres + scrypt passwords + opaque httpOnly sessions) coexist via ESCAPE_HATCH_IDENTITY_PROVIDER=none|supabase|portable. Path A: 0002 RLS with auth.uid(); Path B: 0003 RLS with current_setting('eh.user_id') — no auth.users. EH-032 adds entitlement evaluator + path-specific 0004 migrations for fresh entitled metadata SELECT. Soft persona remains for local preview only and never authorizes admin. Auth/DB adapters report readiness only with real non-placeholder env, still labeled preview. Kit builds with neither path configured. productionSafe remains false. Package tests use mocks/SQL review — no live DB required.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/template/lib/identity/types.ts",
      "packages/escape-hatch/template/lib/identity/session.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts",
      "packages/escape-hatch/template/lib/identity/admin-access.ts",
      "packages/escape-hatch/template/lib/entitlements/index.ts",
      "packages/escape-hatch/template/lib/supabase/client.ts",
      "packages/escape-hatch/template/lib/supabase/server.ts",
      "packages/escape-hatch/template/lib/portable-auth/index.ts",
      "packages/escape-hatch/template/lib/portable-auth/crypto.ts",
      "packages/escape-hatch/template/lib/portable-auth/session.ts",
      "packages/escape-hatch/template/lib/adapters/types.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/db/migrations/0002_identity_rls.sql",
      "packages/escape-hatch/template/db/migrations/0003_portable_identity.sql",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_supabase.sql",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_portable.sql",
      "packages/escape-hatch/template/db/schema/0002_identity_rls.sql",
      "packages/escape-hatch/template/db/schema/0003_portable_identity.sql",
      "packages/escape-hatch/template/app/login/page.tsx",
      "packages/escape-hatch/template/app/auth/callback/route.ts",
      "packages/escape-hatch/template/app/auth/logout/route.ts",
      "packages/escape-hatch/template/app/auth/portable/login/route.ts",
      "packages/escape-hatch/template/scripts/bootstrap-identity.md",
      "packages/escape-hatch/tests/escape-hatch-identity.test.ts",
      "packages/escape-hatch/tests/escape-hatch-portable-identity.test.ts",
      "packages/escape-hatch/tests/escape-hatch-entitlements.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "entitlement-evaluator",
    title: "Entitlement evaluation and grant merge",
    state: "preview_only",
    evidence:
      "EH-032 ships server-only lib/entitlements (evaluateAccess, grant merge, freshness helpers) plus Path A/B 0004 SQL (fresh_entitlement_tiers, entitled_for_access, grant audit, expires_at/revoked_at). Merges Patreon OR billing OR manual grants; staff override; soft persona only in local_preview. Fail-closed on stale/expired/revoked premium grants. Wired into post page and EH-033 media delivery. productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/entitlements/index.ts",
      "packages/escape-hatch/template/lib/entitlements/evaluate.ts",
      "packages/escape-hatch/template/lib/entitlements/merge.ts",
      "packages/escape-hatch/template/lib/entitlements/freshness.ts",
      "packages/escape-hatch/template/lib/entitlements/server.ts",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_supabase.sql",
      "packages/escape-hatch/template/db/migrations/0004_entitlement_evaluator_portable.sql",
      "packages/escape-hatch/template/app/p/[slug]/page.tsx",
      "packages/escape-hatch/template/OPERATIONS.md",
      "packages/escape-hatch/tests/escape-hatch-entitlements.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "private-media-delivery",
    title: "Private media delivery and signed URLs",
    state: "preview_only",
    evidence:
      "EH-033 ships template/lib/media (mode resolve, object keys, mock/R2 signer, redirect host allowlist) and GET /api/media/{mediaId}: evaluateAccess → local_private stream or short-lived signed R2 redirect. Soft persona cookie (id only) honored only when provider is none. Fail closed when private_r2 lacks credentials. Default fill avoids staging premium under public/media. EH-034 UX never fetches /api/media while locked. productionSafe remains false — Milestone 3 security/browser gate, public_legacy residual, billing/deploy open.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/media/delivery.ts",
      "packages/escape-hatch/template/lib/media/sign.ts",
      "packages/escape-hatch/template/app/api/media/[mediaId]/route.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/tests/escape-hatch-private-media.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "account-paywall-ux",
    title: "Account and paywall UX",
    state: "preview_only",
    evidence:
      "EH-034 ships /account (session + membership summary + POST sign-out), provider-aware login wiring, PaywallOverlay/EntitlementStatusBanner on gallery/post, locked posts skip /api/media, soft persona UI only when provider none, staff override copy without fake patron messaging, billing-not-configured honesty. EH-035 moves account/login onto PatronChrome (not ConsoleNav) with cold-gallery tokens. Calls through EH-032 evaluateAccess and EH-033 private media — never client-only unlock. productionSafe remains false pending Milestone 3 security review + browser personas gate.",
    sourcePaths: [
      "packages/escape-hatch/template/app/account/page.tsx",
      "packages/escape-hatch/template/components/AccountShell.tsx",
      "packages/escape-hatch/template/components/PaywallOverlay.tsx",
      "packages/escape-hatch/template/components/EntitlementStatusBanner.tsx",
      "packages/escape-hatch/template/components/SignOutButton.tsx",
      "packages/escape-hatch/template/components/VisitorMedia.tsx",
      "packages/escape-hatch/template/components/GalleryApp.tsx",
      "packages/escape-hatch/template/components/PostView.tsx",
      "packages/escape-hatch/template/components/PatronChrome.tsx",
      "packages/escape-hatch/template/lib/paywall/copy.ts",
      "packages/escape-hatch/template/lib/account/summary.ts",
      "packages/escape-hatch/template/OPERATIONS.md",
      "packages/escape-hatch/template/OWNERSHIP.md",
      "packages/escape-hatch/tests/escape-hatch-account-paywall.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "billing-adapters",
    title: "Stripe + alternate billing adapters",
    state: "preview_only",
    evidence:
      "EH-051 Stripe + EH-053 NOWPayments shell (injectable CI). Checkout gated by attestation + active provider. CCBill/Segpay guidance only (merchant approval/LLC). productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/adapters/types.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/lib/billing/",
      "packages/escape-hatch/template/app/api/billing/",
      "packages/escape-hatch/tests/escape-hatch-billing-contract.test.ts",
      "packages/escape-hatch/tests/escape-hatch-billing-stripe.test.ts",
      "packages/escape-hatch/tests/escape-hatch-billing-alternate.test.ts",
      "src/payments/provider-adapter.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "provider-policy",
    title: "Provider policy router",
    state: "preview_only",
    evidence:
      "EH-052/053: dated matrix (Stripe + NOWPayments + CCBill + Segpay), attestation, recipe router with crypto Checkout + merchant-approval guidance. Admin /admin/billing/policy. productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/billing/policy/",
      "packages/escape-hatch/template/app/admin/billing/policy/",
      "packages/escape-hatch/template/app/api/admin/billing/attestation/",
      "packages/escape-hatch/tests/escape-hatch-billing-policy.test.ts",
      "packages/escape-hatch/tests/escape-hatch-billing-alternate.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "deploy-adapters",
    title: "Deploy adapters (kit manifests + Relay stubs)",
    state: "preview_only",
    evidence:
      "EH-020 generated kits include vercel.json, Dockerfile/.dockerignore, optional docker-compose, and escape-hatch.manifest.json listing deploy targets and env names. Relay src/deploy/deploy-adapter.ts remains a synthetic timeline stub. Verified Vercel/Docker golden paths are EH-070/071 — manifests alone are not production deploy proof.",
    sourcePaths: [
      "packages/escape-hatch/template/vercel.json",
      "packages/escape-hatch/template/Dockerfile",
      "packages/escape-hatch/template/escape-hatch.manifest.json",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "src/deploy/deploy-adapter.ts",
      "packages/escape-hatch/src/zip-kit.ts"
    ],
    risk: "high",
    nextSlice: "EH-070"
  },
  {
    id: "native-admin",
    title: "Native generated-site admin",
    state: "preview_only",
    evidence:
      "EH-022 admin shell under /admin (overview health framing, posts, media, tiers) with Hatch Console nav entry. EH-030/031 wires identity: when provider is none/unset (and Supabase not auto-selected), shows identity not configured and local-operator preview (reads + mutations); when Path A or Path B is active, staff session required for admin inventory reads and mutations (soft persona never authorizes). Auth/DB adapters may report ok:true only with real non-placeholder env and still label preview. Media inventory never treats public/media as private-verified. productionSafe remains false; signed private media is EH-033.",
    sourcePaths: [
      "packages/escape-hatch/template/app/admin/page.tsx",
      "packages/escape-hatch/template/app/admin/posts/page.tsx",
      "packages/escape-hatch/template/app/admin/media/page.tsx",
      "packages/escape-hatch/template/app/admin/tiers/page.tsx",
      "packages/escape-hatch/template/app/api/admin/attention/route.ts",
      "packages/escape-hatch/template/components/admin/AdminShell.tsx",
      "packages/escape-hatch/template/components/admin/AdminOverview.tsx",
      "packages/escape-hatch/template/components/admin/AdminPosts.tsx",
      "packages/escape-hatch/template/components/ConsoleNav.tsx",
      "packages/escape-hatch/template/lib/admin/load-admin.ts",
      "packages/escape-hatch/template/lib/identity/admin-access.ts",
      "packages/escape-hatch/tests/escape-hatch-admin.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "migration-import",
    title: "Migration and canonical import pipeline",
    state: "preview_only",
    evidence:
      "EH-011 importCanonical / import-relay-dump produce SiteBundle plus versioned provenance, local mutable state, conflict queue, and import report; EH-012 adds resumable private object migration ledger with checksums and live private-read re-verification on resume (ledger verified alone is never success) via an injected storage port (in-memory default; R2 needs anonymous probe to claim private_read_verified). productionSafe is false.",
    sourcePaths: [
      "packages/escape-hatch/src/import/importer.ts",
      "packages/escape-hatch/src/import/load-relay-dump.ts",
      "packages/escape-hatch/src/import/types.ts",
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/migrate/types.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts",
      "packages/escape-hatch/tests/escape-hatch-migrate.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "library-truth-parity",
    title: "Library truth wizard and parity report",
    state: "preview_only",
    evidence:
      "EH-013 builds library-parity-report/1.0.0 and library-truth-state/1.0.0 under kit data/, surfaces anomalies with exclude-from-build, soft access simulation, and a continue gate that requires 100% accounted-for items plus no unresolved blocking anomalies (premium media without verified private source blocks unless excluded). Kit load and mutations always rebuild parity from site.bundle + import + migration artifacts via byte-copied library-truth modules (never trust a tampered on-disk report alone). POST /api/library-truth requires x-escape-hatch-local: 1 and loopback host only — local-prototype operator gating only, not authentication; no remote env override. productionSafe remains false; not EH-033 private delivery.",
    sourcePaths: [
      "packages/escape-hatch/src/library-truth/build-report.ts",
      "packages/escape-hatch/src/library-truth/gate.ts",
      "packages/escape-hatch/src/library-truth/kit-io.ts",
      "packages/escape-hatch/src/library-truth/validate.ts",
      "packages/escape-hatch/src/library-truth/local-operator.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/template/lib/library-truth/index.ts",
      "packages/escape-hatch/template/app/api/library-truth/route.ts",
      "packages/escape-hatch/template/components/LibraryTruthView.tsx",
      "packages/escape-hatch/template/app/library/page.tsx",
      "packages/escape-hatch/tests/escape-hatch-library-truth.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "backup-restore",
    title: "Backup and restore",
    state: "not_implemented",
    evidence: "No backup/restore surfaces, diagnostic bundle, or operator recovery path in escape-hatch.",
    sourcePaths: [],
    risk: "medium",
    nextSlice: "EH-073"
  },
  {
    id: "provider-readiness",
    title: "Provider readiness checks",
    state: "preview_only",
    evidence:
      "EH-030/031 Auth/DB adapters expose env-honest readiness (ok only when Path A Supabase URL/anon or Path B DATABASE_URL+session secret are real and non-placeholder; still labeled preview). EH-050/051 billing readiness is env-honest (stub fail-closed; Stripe ready when secrets or injected client present). No live Stripe network probes in package tests. Executable readiness for provider policy (EH-052), Vercel/domain/DNS (EH-070), and transactional email (EH-072) remains open; passing fixture tests are not production evidence.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/lib/billing/readiness.ts",
      "packages/escape-hatch/template/lib/env.ts",
      "packages/escape-hatch/tests/escape-hatch-identity.test.ts",
      "packages/escape-hatch/tests/escape-hatch-portable-identity.test.ts",
      "packages/escape-hatch/tests/escape-hatch-billing-contract.test.ts",
      "src/payments/provider-adapter.ts",
      "src/deploy/deploy-adapter.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  },
  {
    id: "creator-patreon-oauth",
    title: "Creator-owned Patreon OAuth",
    state: "preview_only",
    evidence:
      "EH-040 ships creator_oauth path: typed env (PATREON_* + ESCAPE_HATCH_PATREON_*), AES-256-GCM refresh-token crypto, HMAC+PKCE OAuth state, PatreonClient exchange/refresh (injectable fetch), campaign-bound identity extraction, link upsert + entitlement snapshot source=patreon, SQL 0005_* RLS fail-closed credential tables, /api/patreon/oauth/start|callback, /account Connect Patreon, /admin/patreon ops checklist. Fail-closed without real credentials; no live Patreon in CI. relay_managed implemented in EH-041 side-by-side. productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/patreon/",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/db/migrations/0005_patreon_oauth_supabase.sql",
      "packages/escape-hatch/template/db/migrations/0005_patreon_oauth_portable.sql",
      "packages/escape-hatch/template/app/api/patreon/oauth/start/route.ts",
      "packages/escape-hatch/template/app/api/patreon/oauth/callback/route.ts",
      "packages/escape-hatch/template/app/admin/patreon/page.tsx",
      "packages/escape-hatch/template/app/account/page.tsx",
      "packages/escape-hatch/tests/escape-hatch-patreon-oauth.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "relay-managed-patreon-verification",
    title: "Relay-managed Patreon verification",
    state: "preview_only",
    evidence:
      "EH-041 ships relay_managed path: kit verifies EdDSA assertions (iss/aud/kid/exp/nbf/nonce/observation/replay), POST-only start + GET callback, kill switch fail-closed, migration metadata export (non-secret). Relay src/escape-hatch/managed-verify provides in-memory registry, allowlisted callbacks, key rotation overlap, revocation, JWKS, stub metrics. No live Patreon in CI. productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/patreon/relay-managed/",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/app/api/patreon/relay/start/route.ts",
      "packages/escape-hatch/template/app/api/patreon/relay/callback/route.ts",
      "src/escape-hatch/managed-verify/",
      "packages/escape-hatch/tests/escape-hatch-relay-managed.test.ts",
      "tests/escape-hatch-managed-verify.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "relay-managed-connector-billing",
    title: "Relay billing entitlement for managed Patreon connector",
    state: "preview_only",
    evidence:
      "EH-042 ships a separate configurable monthly add-on SKU (relay_managed_patreon_connector) on Relay billing: entitlement state machine active|grace|cancelled|past_due|none, Stripe-like webhook normalization with signature fail-closed + idempotency, feature flag ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED, gated managed-verify assertion mint, cancellation/migration copy + stale warning without deleting patron links. Kit observes entitlement via env mirror; relay_managed health degrades when not entitled; creator_oauth unaffected. No live Stripe in CI. productionSafe remains false.",
    sourcePaths: [
      "src/escape-hatch/managed-verify-billing/",
      "src/escape-hatch/managed-verify/service.ts",
      "packages/escape-hatch/template/lib/patreon/relay-managed/billing.ts",
      "packages/escape-hatch/template/app/admin/patreon/page.tsx",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "tests/escape-hatch-managed-verify-billing.test.ts",
      "packages/escape-hatch/tests/escape-hatch-connector-billing.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-054"
  },
  {
    id: "oauth-choice-migration-ux",
    title: "OAuth choice and migration UX",
    state: "preview_only",
    evidence:
      "EH-043 ships neutral Hatch Console choice (/admin/patreon/choice): Own your Patreon connection vs Let Relay maintain it — neither preselected; disclosure cards for data/dependencies/cancellation/migration; managed monthly price from EH-042 product copy; setup checklists; health summary (adapter + billing entitlement + kill switches); bounded outage copy; switch-off to creator_oauth via non-secret data/patreon-mode-preference.json + env instruction (no rebuild, patrons preserved). productionSafe remains false.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/patreon/oauth-choice.ts",
      "packages/escape-hatch/template/lib/patreon/mode-preference.ts",
      "packages/escape-hatch/template/components/admin/PatreonOAuthChoice.tsx",
      "packages/escape-hatch/template/components/admin/PatreonModeSwitchOff.tsx",
      "packages/escape-hatch/template/app/admin/patreon/page.tsx",
      "packages/escape-hatch/template/app/admin/patreon/choice/page.tsx",
      "packages/escape-hatch/template/app/api/admin/patreon/mode-preference/route.ts",
      "packages/escape-hatch/tests/escape-hatch-oauth-choice.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-054"
  }
];

const PROTOTYPE_WARNINGS: string[] = [
  "productionSafe is false — this deliverable is prototype/preview-only.",
  "EH-053 alternate billing recipes are preview_only — NOWPayments crypto shell + CCBill/Segpay merchant-approval guidance; productionSafe false pending Milestone 3.",
  "EH-043 OAuth choice / migration UX is preview_only — preference file is non-secret operator intent; runtime mode remains ESCAPE_HATCH_PATREON_MODE; Milestone 4 residuals (live multi-tenant managed outage proof) remain open.",
  "EH-042 Relay connector billing entitlement is preview_only — in-memory webhook store; kit status is an env mirror, not live Stripe Checkout.",
  "EH-040 creator-owned Patreon OAuth is preview_only — mocked fetch in tests; live campaign link still needs creator credentials and Milestone gate.",
  "EH-041 Relay-managed Patreon verification is preview_only — in-memory Relay registry + mocked Patreon; assertion crypto is CI-covered but not a production multi-tenant deploy.",
  "EH-035 visitor visual system is preview_only — cold-gallery tokens and chrome split land, but Milestone 3 security review + browser personas gate remains open.",
  "EH-034 account/paywall UX is preview_only — locked/unlocked honesty is wired, but Milestone 3 security review + browser personas gate remains open.",
  "EH-033 private media delivery is preview_only — default private path closes premium public/media staging, but live independent billing and verified deploy remain open.",
  "ESCAPE_HATCH_MEDIA_MODE=public_legacy reintroduces world-readable premium copies under public/media — residual leakage only; never production.",
  "EH-032 entitlement evaluator is preview_only — grant merge authorizes metadata and media delivery decisions but does not alone make the kit production-safe.",
  "EH-030/031 identity paths are preview_only — configured Auth/DB readiness is not a production-safe deploy claim.",
  "EH-022 native admin: when identity is unset, local-operator gating is not authentication; when Path A/B is active, staff session is required for admin reads and mutations — soft personas never authorize admin.",
  "EH-021 premium patron theme is soft-gate / preview-only; soft paywall UI is not production security.",
  "EH-020 generated repository chassis installs/builds without Relay credentials but is not a production-safe deploy.",
  "Default fill stages premium under data/private-media; visitor premium bytes require /api/media after evaluateAccess (anonymous denied); locked UI never fetches those bytes.",
  "EH-012 private object migration ledger entries are not visitor delivery; public/media is never accepted as private-read verification.",
  "EH-013 library-truth continue gate is a soft audit gate; it does not enable production-safe launch.",
  "EH-013 library-truth mutations require header x-escape-hatch-local: 1 and localhost/127.0.0.1 only; this is local-prototype operator gating only, not authentication — no remote env override.",
  "EH-013 kit Library truth always rebuilds parity from data/ artifacts on load and before mutations; a tampered library-parity-report.json alone cannot greenwash can_continue or library_truth_complete.",
  "R2 without an explicit anonymous probe (publicBaseUrl + allowPublicProbe) cannot claim private_read_verified — authenticated GetObject alone is insufficient.",
  "Client demo persona state is non-authoritative; soft persona cookie carries persona id only — tiers resolve server-side from the bundle when provider is none; Path A/B hide persona switch and block elevation.",
  "Package preview access helpers align with canonical tier semantics; server entitlement evaluation uses fail-closed snapshots and grant merge (EH-032).",
  "Service role keys, R2 secrets, Patreon client secrets, Stripe secret/webhook keys, and token encryption keys must never be committed or shipped to the browser; RLS fails closed for patrons.",
  "Vercel/Docker manifests are present; verified golden-path deploy remains EH-070/071.",
  "Relay Part 2 billing adapter remains a synthetic stub and must not be treated as production or provider proof.",
  "Passing package tests or a successful local preview does not make any soft-gated capability production-safe."
];

const BLOCKERS: string[] = [
  "Milestone 3 security review + browser personas gate remains open before productionSafe can flip.",
  "Tier/billing wizard (EH-054) and Milestone 3 security/browser gate remain open; never disguise adult content to unlock Stripe.",
  "Verified Vercel/Docker production deploy rehearsals remain open (EH-070/071).",
  "Mature/legal-adult enforcement beyond accounted exclusions remains open.",
  "public_legacy media mode remains available as an explicit residual leakage path — keep productionSafe false while it exists.",
  "Milestone 4 residual: live multi-tenant managed-verify outage + migration drill beyond kit/CI honesty remains open."
];

export function buildEscapeHatchStatus(): EscapeHatchStatus {
  return {
    schemaVersion: ESCAPE_HATCH_STATUS_SCHEMA_VERSION,
    slice: ESCAPE_HATCH_SLICE,
    deliverable: "prototype_preview_only",
    productionSafe: false,
    summary:
      "Escape Hatch through EH-053 delivers identity, entitlements, private media, Patreon paths, Stripe Billing, provider policy router, and lawful alternate recipes (NOWPayments shell + CCBill/Segpay guidance); productionSafe remains false pending Milestone 3 security/browser gate, EH-054 tier wizard, and verified deploy.",
    prototypeWarnings: [...PROTOTYPE_WARNINGS],
    capabilities: CAPABILITIES.map((c) => ({
      ...c,
      sourcePaths: [...c.sourcePaths]
    })),
    blockers: [...BLOCKERS],
    nextSlice: {
      id: "EH-054",
      title: "Tier and billing wizard",
      focus: [
        "Map tiers to prices with duplicate-billing safeguards",
        "Sandbox results and unified /tiers catalog preview",
        "Context-aware Patreon/independent actions per visitor contract"
      ]
    }
  };
}

function stateLabel(state: CapabilityState): string {
  const labels: Record<CapabilityState, string> = {
    production_safe: "production-safe",
    preview_only: "preview-only",
    stub_only: "stub-only",
    not_implemented: "not implemented",
    reusable_relay_source: "reusable Relay source"
  };
  return labels[state];
}

export function formatHumanStatus(status: EscapeHatchStatus): string {
  const lines: string[] = [];

  lines.push("Escape Hatch Status");
  lines.push(`Schema: ${status.schemaVersion} · Slice: ${status.slice}`);
  lines.push("");
  lines.push("*** NOT PRODUCTION SAFE — PROTOTYPE / PREVIEW ONLY ***");
  lines.push(`productionSafe: ${status.productionSafe}`);
  lines.push("");
  lines.push(status.summary);
  lines.push("");
  lines.push("Prototype warnings:");
  for (const w of status.prototypeWarnings) {
    lines.push(`  ! ${w}`);
  }
  lines.push("");
  lines.push("Capabilities:");
  for (const cap of status.capabilities) {
    lines.push(`  [${cap.id}] ${cap.title}`);
    lines.push(`    state: ${stateLabel(cap.state)} · risk: ${cap.risk}`);
    lines.push(`    evidence: ${cap.evidence}`);
    if (cap.sourcePaths.length > 0) {
      lines.push(`    sources: ${cap.sourcePaths.join(", ")}`);
    }
    if (cap.nextSlice) {
      lines.push(`    next slice: ${cap.nextSlice}`);
    }
  }
  lines.push("");
  lines.push("Blockers:");
  for (const b of status.blockers) {
    lines.push(`  - ${b}`);
  }
  lines.push("");
  lines.push(`Next slice: ${status.nextSlice.id} — ${status.nextSlice.title}`);
  for (const f of status.nextSlice.focus) {
    lines.push(`  · ${f}`);
  }
  lines.push("");
  lines.push(
    "Reminder: fixture tests passing does not authorize deployment. Run with --json for machine-readable output."
  );

  return lines.join("\n");
}
