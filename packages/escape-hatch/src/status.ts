/**
 * Deterministic Escape Hatch capability inventory (through EH-030).
 * No timestamps, env reads, network, or live data — informational only.
 */

export const ESCAPE_HATCH_STATUS_SCHEMA_VERSION = "escape-hatch-status/1.0.0";

export const ESCAPE_HATCH_SLICE = "EH-030";

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
    id: "EH-031";
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
      "fixture, wizard, build, from-relay, from-clone, import-relay-dump, migrate-media, library-truth / parity-report, and zip subcommands materialize a standalone Next.js kit (typed env, SQL migrations + RLS, Vercel/Docker manifests, adapter surfaces, premium patron theme, native admin shell, optional Supabase identity) plus import/migration/library-parity artifacts; suitable for local preview only.",
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
    nextSlice: "EH-031"
  },
  {
    id: "generated-repository",
    title: "Generated repository chassis",
    state: "preview_only",
    evidence:
      "EH-020 chassis plus EH-030 identity: package.json + Next App Router, typed lib/env.ts + .env.example (Supabase URL/anon/service names), db/schema + db/migrations SQL including RLS (no live DB required for next build), lib/adapters with optional Supabase Auth/DB implementations, escape-hatch.manifest.json, vercel.json, Dockerfile/.dockerignore, optional loopback-only docker-compose Postgres profile. Install/build from a clean directory without RELAY_* / root .env. productionSafe remains false — not a production-safe deploy; public/media in Docker images is prototype leakage until EH-033.",
    sourcePaths: [
      "packages/escape-hatch/template/package.json",
      "packages/escape-hatch/template/lib/env.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/db/migrations/0001_preview_chassis.sql",
      "packages/escape-hatch/template/db/migrations/0002_identity_rls.sql",
      "packages/escape-hatch/template/escape-hatch.manifest.json",
      "packages/escape-hatch/template/vercel.json",
      "packages/escape-hatch/template/Dockerfile",
      "packages/escape-hatch/template/.env.example",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/tests/escape-hatch-generated-repo.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-031"
  },
  {
    id: "premium-patron-theme",
    title: "Premium patron theme",
    state: "preview_only",
    evidence:
      "EH-021 adapts Relay patron-gallery media hierarchy into a standalone kit theme (GalleryApp, PostView, PaywallTeaser, PatronChrome) with controlled branding dials (logo, display name, intro, accent, approved type pairings, light/dark/warm schemes, gallery density, cover crop, paywall message, community CTA). No comments, favorites, or Relay network chrome on visitor routes; soft persona switch remains labeled non-authoritative. Soft-gate / preview-only — not EH-033 private media delivery; productionSafe remains false. Visitor routes stay visually distinct from the EH-022 admin shell.",
    sourcePaths: [
      "packages/escape-hatch/template/components/GalleryApp.tsx",
      "packages/escape-hatch/template/components/PostView.tsx",
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
    nextSlice: "EH-034"
  },
  {
    id: "soft-persona-gate",
    title: "Soft client persona gate",
    state: "preview_only",
    evidence:
      "Generated site switches visible paywall UI by demo persona (public, patron, tier) in client state when identity is unset; persona tier_ids are not authoritative entitlements and never authorize admin or premium server-side. Intended identity path is Supabase session + membership/entitlement snapshots (EH-030).",
    sourcePaths: [
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/template/lib/access.ts",
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts"
    ],
    risk: "critical",
    nextSlice: "EH-034"
  },
  {
    id: "public-media-copy",
    title: "All generated media copied to public",
    state: "preview_only",
    evidence:
      "fill-template still copies every bundle media file into public/media, including member_only and tier_gated assets; direct HTTP GET to locked paths returns 200 with public bytes (known prototype security failure). EH-012 migrate-media records private object keys under data/ and never treats public/media as private-read success. Admin media inventory (EH-022) surfaces the same honesty.",
    sourcePaths: [
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/migrate/validate.ts"
    ],
    risk: "critical",
    nextSlice: "EH-033"
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
    nextSlice: "EH-033"
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
      "Fixture matrix (MATRIX.json) covers sanitized OAuth/cookie Patreon JSON, SiteBundle/Clone adaptations with branding dials, relay-dump import + media migration + library-truth parity accounting, generated-repo chassis smoke, premium patron theme branding fields, native admin shell routes against fixture data, identity/RLS SQL review tests, promoted tombstone/legacy-tier families, and deferred mature/legal enforcement stubs; secret/PII scan remains wired.",
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
      "tests/fixtures/patreon/oauth-list-post-text-only.json",
      "tests/fixtures/patreon/cookie-list-with-media.json"
    ],
    risk: "medium",
    nextSlice: "EH-031"
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
    nextSlice: "EH-031"
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
    nextSlice: "EH-031"
  },
  {
    id: "simplified-access-semantics",
    title: "Canonical-aligned preview access semantics",
    state: "preview_only",
    evidence:
      "The shared preview evaluator matches canonical paid/free, exact-tier, and tier-or-higher ordering semantics using serialized tier catalog data; soft persona remains client-only. Server entitlement reads use fail-closed snapshots (EH-030) and do not trust client tier_ids.",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/src/library-truth/build-report.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts",
      "src/clone/tier-rules.ts"
    ],
    risk: "high",
    nextSlice: "EH-032"
  },
  {
    id: "generated-site-identity",
    title: "Generated-site patron identity",
    state: "preview_only",
    evidence:
      "EH-030 ships creator-owned Supabase Auth/Postgres path: SQL migrations for profiles, site memberships, entitlement snapshots, and fail-closed RLS (patrons may SELECT only public published posts/media metadata until EH-032; drafts and premium rows staff-only); typed env for URL/anon/service keys; server/client Supabase clients; login/callback/logout (POST) routes; admin requires staff session for inventory reads and mutations when identity configured and shows identity not configured when unset. Soft persona remains for local preview only and never authorizes admin. Auth/DB adapters report readiness only with real non-placeholder env, still labeled preview. productionSafe remains false. Package tests use mocks/SQL review — no live Supabase required.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/template/lib/identity/types.ts",
      "packages/escape-hatch/template/lib/identity/session.ts",
      "packages/escape-hatch/template/lib/identity/entitlements.ts",
      "packages/escape-hatch/template/lib/identity/admin-access.ts",
      "packages/escape-hatch/template/lib/supabase/client.ts",
      "packages/escape-hatch/template/lib/supabase/server.ts",
      "packages/escape-hatch/template/lib/adapters/types.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/db/migrations/0002_identity_rls.sql",
      "packages/escape-hatch/template/db/schema/0002_identity_rls.sql",
      "packages/escape-hatch/template/app/login/page.tsx",
      "packages/escape-hatch/template/app/auth/callback/route.ts",
      "packages/escape-hatch/template/app/auth/logout/route.ts",
      "packages/escape-hatch/template/scripts/bootstrap-identity.md",
      "packages/escape-hatch/tests/escape-hatch-identity.test.ts"
    ],
    risk: "critical",
    nextSlice: "EH-031"
  },
  {
    id: "private-media-delivery",
    title: "Private media delivery and signed URLs",
    state: "not_implemented",
    evidence:
      "EH-012 migrates objects into opaque private keys with private-read checks that require authenticated success and anonymous denial (memory adapter fully proves; R2 requires publicBaseUrl + allowPublicProbe and otherwise fails closed). The generated app still has no visitor signed-URL gateway or entitlement enforcement; StorageProvider.signGetObject stub returns null. Relay media-delivery-policy is not integrated into the kit. public/media coexistence remains prototype leakage.",
    sourcePaths: [
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/migrate/storage-port.ts",
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "src/storage/media-delivery-policy.ts",
      "src/storage/relay-upload-r2.ts"
    ],
    risk: "critical",
    nextSlice: "EH-033"
  },
  {
    id: "billing-adapters",
    title: "Billing and checkout (Relay Part 2 stubs)",
    state: "stub_only",
    evidence:
      "src/payments/provider-adapter.ts exposes synthetic checkout success and partial webhook stubs; kit BillingProvider is a typed stub only. Not wired as production or provider proof.",
    sourcePaths: [
      "src/payments/provider-adapter.ts",
      "packages/escape-hatch/template/lib/adapters/types.ts"
    ],
    risk: "critical",
    nextSlice: "EH-050"
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
      "EH-022 admin shell under /admin (overview health framing, posts, media, tiers) with Hatch Console nav entry. EH-030 wires identity: when Supabase env unset, shows identity not configured and local-operator preview (reads + mutations); when configured, staff session required for admin inventory reads and mutations (soft persona never authorizes). Auth/DB adapters may report ok:true only with real non-placeholder env and still label preview. Media inventory never treats public/media as private-verified. productionSafe remains false; signed private media is EH-033.",
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
    nextSlice: "EH-033"
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
    nextSlice: "EH-031"
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
    nextSlice: "EH-031"
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
      "EH-030 Auth/DB adapters expose env-honest readiness (ok only when Supabase URL/anon are real and non-placeholder; still labeled preview). No live network probes in package tests. Executable readiness for Stripe billing (EH-051), provider policy (EH-052), Vercel/domain/DNS (EH-070), and transactional email (EH-072) remains open; passing fixture tests are not production evidence.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/adapters/index.ts",
      "packages/escape-hatch/template/lib/env.ts",
      "packages/escape-hatch/tests/escape-hatch-identity.test.ts",
      "src/payments/provider-adapter.ts",
      "src/deploy/deploy-adapter.ts"
    ],
    risk: "high",
    nextSlice: "EH-031"
  }
];

const PROTOTYPE_WARNINGS: string[] = [
  "productionSafe is false — this deliverable is prototype/preview-only.",
  "EH-030 Supabase identity is preview_only — configured Auth/DB readiness is not a production-safe deploy claim; EH-033 public media leakage remains.",
  "EH-022 native admin: when identity is unset, local-operator gating is not authentication; when configured, staff session is required for admin reads and mutations — soft personas never authorize admin.",
  "EH-021 premium patron theme is soft-gate / preview-only; soft paywall UI is not production security.",
  "EH-020 generated repository chassis installs/builds without Relay credentials but is not a production-safe deploy.",
  "Premium (member_only and tier_gated) media bytes are still copied to public/media by fillTemplate and are directly fetchable without authentication.",
  "Direct HTTP GET to a locked premium media URL is expected to return HTTP 200 with public bytes; this is a known prototype security failure, not a passing paywall.",
  "EH-012 private object migration ledger entries are not visitor delivery; public/media is never accepted as private-read verification.",
  "EH-013 library-truth continue gate is a soft audit gate; it does not enable production-safe private media.",
  "EH-013 library-truth mutations require header x-escape-hatch-local: 1 and localhost/127.0.0.1 only; this is local-prototype operator gating only, not authentication — no remote env override.",
  "EH-013 kit Library truth always rebuilds parity from data/ artifacts on load and before mutations; a tampered library-parity-report.json alone cannot greenwash can_continue or library_truth_complete.",
  "R2 without an explicit anonymous probe (publicBaseUrl + allowPublicProbe) cannot claim private_read_verified — authenticated GetObject alone is insufficient.",
  "Client demo persona state is non-authoritative; switching persona only changes UI gating, not server entitlements.",
  "Package preview access helpers align with canonical tier semantics but remain client-only unless entitlement snapshots are loaded server-side.",
  "Service role keys must never be committed or shipped to the browser; RLS fails closed for patrons.",
  "Vercel/Docker manifests are present; shipping public/media remains prototype leakage until EH-033; verified golden-path deploy remains EH-070/071.",
  "Relay Part 2 billing adapter remains a synthetic stub and must not be treated as production or provider proof.",
  "Passing package tests or a successful local preview does not make any soft-gated capability production-safe."
];

const BLOCKERS: string[] = [
  "Premium media remains world-readable in public/ for soft preview; server-enforced private visitor delivery belongs to EH-033.",
  "Portable Postgres/auth adapter parity for Docker remains open (EH-031).",
  "Entitlement service freshness, Patreon/billing/manual grant merge, and audit belong to EH-032.",
  "Billing is stub-only; creator-owned Stripe/eligible adapters belong to EH-050/051.",
  "Verified Vercel/Docker production deploy rehearsals remain open (EH-070/071).",
  "Mature/legal-adult enforcement beyond accounted exclusions remains open."
];

export function buildEscapeHatchStatus(): EscapeHatchStatus {
  return {
    schemaVersion: ESCAPE_HATCH_STATUS_SCHEMA_VERSION,
    slice: ESCAPE_HATCH_SLICE,
    deliverable: "prototype_preview_only",
    productionSafe: false,
    summary:
      "Escape Hatch through EH-030 delivers a standalone generated Next.js chassis with optional creator-owned Supabase Auth/Postgres (schema, RLS, session scaffolding, bootstrap docs), premium patron visitor theme, native admin shell with identity-aware gating, Library truth, and soft persona local-preview; public/media prototype leakage remains; productionSafe is false.",
    prototypeWarnings: [...PROTOTYPE_WARNINGS],
    capabilities: CAPABILITIES.map((c) => ({
      ...c,
      sourcePaths: [...c.sourcePaths]
    })),
    blockers: [...BLOCKERS],
    nextSlice: {
      id: "EH-031",
      title: "Portable identity/data path",
      focus: [
        "Postgres/auth adapter parity for Docker without Supabase Auth",
        "Same membership and entitlement contracts as EH-030",
        "Honest health and bootstrap without Relay runtime credentials"
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
