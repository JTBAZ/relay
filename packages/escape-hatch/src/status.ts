/**
 * Deterministic Escape Hatch capability inventory (through EH-013).
 * No timestamps, env reads, network, or live data — informational only.
 */

export const ESCAPE_HATCH_STATUS_SCHEMA_VERSION = "escape-hatch-status/1.0.0";

export const ESCAPE_HATCH_SLICE = "EH-013";

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
    id: "EH-020";
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
      "fixture, wizard, build, from-relay, from-clone, import-relay-dump, migrate-media, library-truth / parity-report, and zip subcommands materialize a Next.js kit plus import, migration, and library-parity artifacts; suitable for local preview only.",
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
    nextSlice: "EH-020"
  },
  {
    id: "soft-persona-gate",
    title: "Soft client persona gate",
    state: "preview_only",
    evidence:
      "Generated site switches visible paywall UI by demo persona (public, patron, tier) in client state; persona tier_ids are not authoritative entitlements.",
    sourcePaths: [
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/template/lib/access.ts",
      "packages/escape-hatch/template/lib/site-session.ts"
    ],
    risk: "critical",
    nextSlice: "EH-030"
  },
  {
    id: "public-media-copy",
    title: "All generated media copied to public",
    state: "preview_only",
    evidence:
      "fill-template still copies every bundle media file into public/media, including member_only and tier_gated assets; direct HTTP GET to locked paths returns 200 with public bytes (known prototype security failure). EH-012 migrate-media records private object keys under data/ and never treats public/media as private-read success.",
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
      "fill-template writes both data/site.json and data/theme.json and public/site.json and public/theme.json; the public copies are client-readable without server-side entitlement enforcement. Import provenance/local-state/report, media-migration ledger/report, and library-parity report/state stay under data/ only.",
    sourcePaths: [
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/template/lib/load-site.ts",
      "packages/escape-hatch/template/lib/site-session.ts",
      "packages/escape-hatch/src/migrate/kit-io.ts",
      "packages/escape-hatch/src/library-truth/kit-io.ts"
    ],
    risk: "high",
    nextSlice: "EH-020"
  },
  {
    id: "duplicate-contracts",
    title: "Versioned shared contracts",
    state: "preview_only",
    evidence:
      "SiteBundle and CloneSiteModel are explicitly versioned and runtime-validated; generated apps receive a byte-identical self-contained canonical contracts module. EH-011 adds import-provenance / import-local-state / import-report; EH-012 adds media-migration-ledger/1.0.0 and media-migration-report/1.0.0; EH-013 adds library-parity-report/1.0.0 and library-truth-state/1.0.0 with fail-closed parsers.",
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
      "EH-013 fixture matrix (MATRIX.json) covers sanitized OAuth/cookie Patreon JSON, SiteBundle/Clone adaptations, relay-dump import + media migration + library-truth parity accounting, promoted tombstone/legacy-tier families, and deferred mature/legal enforcement stubs; secret/PII scan remains wired.",
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
      "tests/fixtures/patreon/oauth-list-post-text-only.json",
      "tests/fixtures/patreon/cookie-list-with-media.json"
    ],
    risk: "medium",
    nextSlice: "EH-020"
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
    nextSlice: "EH-020"
  },
  {
    id: "relay-canonical-reuse",
    title: "Canonical ingest, clone, and export reuse",
    state: "reusable_relay_source",
    evidence:
      "Importer and from-relay load Relay dist clone-generator against canonical and export_index inputs; canonical ingest, clone tier-rules, and export types live in repo src/ and are reused, not reimplemented here. R2 patterns are referenced only; package tests use an in-memory storage port.",
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
    nextSlice: "EH-020"
  },
  {
    id: "simplified-access-semantics",
    title: "Canonical-aligned preview access semantics",
    state: "preview_only",
    evidence:
      "The shared preview evaluator matches canonical paid/free, exact-tier, and tier-or-higher ordering semantics using serialized tier catalog data; it remains client-only soft gating and is not server authorization. Library truth surfaces access ambiguities instead of auto-picking paid tiers by array order.",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/access.ts",
      "packages/escape-hatch/src/library-truth/build-report.ts",
      "src/clone/tier-rules.ts"
    ],
    risk: "high",
    nextSlice: "EH-030"
  },
  {
    id: "generated-site-identity",
    title: "Generated-site patron identity",
    state: "not_implemented",
    evidence:
      "No creator-owned auth, session cookies, entitlement snapshots, or Supabase/Postgres path in the generated kit; preview personas only.",
    sourcePaths: [
      "packages/escape-hatch/template/lib/site-session.ts",
      "src/identity/patron-entitlement-snapshot.ts"
    ],
    risk: "critical",
    nextSlice: "EH-030"
  },
  {
    id: "private-media-delivery",
    title: "Private media delivery and signed URLs",
    state: "not_implemented",
    evidence:
      "EH-012 migrates objects into opaque private keys with private-read checks that require authenticated success and anonymous denial (memory adapter fully proves; R2 requires publicBaseUrl + allowPublicProbe and otherwise fails closed). The generated app still has no visitor signed-URL gateway or entitlement enforcement; Relay media-delivery-policy is not integrated into the kit.",
    sourcePaths: [
      "packages/escape-hatch/src/migrate/engine.ts",
      "packages/escape-hatch/src/migrate/storage-port.ts",
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
      "src/payments/provider-adapter.ts exposes synthetic checkout success and partial webhook stubs; not wired into escape-hatch and not production or provider proof.",
    sourcePaths: ["src/payments/provider-adapter.ts"],
    risk: "critical",
    nextSlice: "EH-050"
  },
  {
    id: "deploy-adapters",
    title: "Deploy adapters (Relay Part 2 stubs)",
    state: "stub_only",
    evidence:
      "src/deploy/deploy-adapter.ts simulates Vercel/Netlify timelines locally; escape-hatch zip export is not a verified deployment pipeline.",
    sourcePaths: [
      "src/deploy/deploy-adapter.ts",
      "packages/escape-hatch/src/zip-kit.ts"
    ],
    risk: "high",
    nextSlice: "EH-070"
  },
  {
    id: "native-admin",
    title: "Native generated-site admin",
    state: "not_implemented",
    evidence: "No admin shell, health framing, or patron override workflows in the generated template.",
    sourcePaths: [],
    risk: "high",
    nextSlice: "EH-022"
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
    nextSlice: "EH-020"
  },
  {
    id: "library-truth-parity",
    title: "Library truth wizard and parity report",
    state: "preview_only",
    evidence:
      "EH-013 builds library-parity-report/1.0.0 and library-truth-state/1.0.0 under kit data/, surfaces anomalies with exclude-from-build, soft access simulation, and a continue gate that requires 100% accounted-for items plus no unresolved blocking anomalies (premium media without verified private source blocks unless excluded). Kit load and mutations always rebuild parity from site.bundle + import + migration artifacts via byte-copied library-truth modules (never trust a tampered on-disk report alone). POST /api/library-truth requires x-escape-hatch-local: 1 and localhost (or ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1) — local-prototype operator gating only, not authentication. productionSafe remains false; not EH-033 private delivery.",
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
    nextSlice: "EH-020"
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
    state: "not_implemented",
    evidence:
      "No executable readiness probes exist for Supabase identity/data (EH-030), Stripe billing (EH-051), provider policy (EH-052), Vercel/domain/DNS (EH-070), or transactional email (EH-072); stub adapters and passing fixture tests are not readiness evidence.",
    sourcePaths: [
      "src/payments/provider-adapter.ts",
      "src/deploy/deploy-adapter.ts"
    ],
    risk: "high"
  }
];

const PROTOTYPE_WARNINGS: string[] = [
  "productionSafe is false — this deliverable is prototype/preview-only.",
  "Premium (member_only and tier_gated) media bytes are still copied to public/media by fillTemplate and are directly fetchable without authentication.",
  "Direct HTTP GET to a locked premium media URL is expected to return HTTP 200 with public bytes; this is a known prototype security failure, not a passing paywall.",
  "EH-012 private object migration ledger entries are not visitor delivery; public/media is never accepted as private-read verification.",
  "EH-013 library-truth continue gate is a soft audit gate; it does not enable production-safe private media.",
  "EH-013 library-truth mutations require header x-escape-hatch-local: 1 and localhost/127.0.0.1 (or ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1); this is local-prototype operator gating only, not authentication.",
  "EH-013 kit Library truth always rebuilds parity from data/ artifacts on load and before mutations; a tampered library-parity-report.json alone cannot greenwash can_continue or library_truth_complete.",
  "R2 without an explicit anonymous probe (publicBaseUrl + allowPublicProbe) cannot claim private_read_verified — authenticated GetObject alone is insufficient.",
  "Client demo persona state is non-authoritative; switching persona only changes UI gating, not server entitlements.",
  "Package preview access helpers align with canonical tier semantics but remain client-only and are not enforced server-side.",
  "Relay Part 2 billing and deploy adapters are synthetic stubs and must not be treated as production or provider proof.",
  "Passing package tests or a successful local preview does not make any soft-gated capability production-safe."
];

const BLOCKERS: string[] = [
  "Premium media remains world-readable in public/ for soft preview; server-enforced private visitor delivery belongs to EH-033.",
  "No hard patron identity, entitlements, or RLS-backed session (EH-030).",
  "Billing and deploy paths are stub-only in Relay core, not creator-owned production integrations (EH-050, EH-070).",
  "Mature/legal-adult enforcement beyond accounted exclusions remains open."
];

export function buildEscapeHatchStatus(): EscapeHatchStatus {
  return {
    schemaVersion: ESCAPE_HATCH_STATUS_SCHEMA_VERSION,
    slice: ESCAPE_HATCH_SLICE,
    deliverable: "prototype_preview_only",
    productionSafe: false,
    summary:
      "Escape Hatch through EH-013 adds a Library truth audit step with versioned parity reports, creator exclusions, access ambiguity surfacing, and a fail-closed continue gate (100% accounted-for; premium media without private-read verification blocks unless explicitly excluded); fillTemplate public/media remains prototype leakage, persona state is non-authoritative, and productionSafe is false.",
    prototypeWarnings: [...PROTOTYPE_WARNINGS],
    capabilities: CAPABILITIES.map((c) => ({
      ...c,
      sourcePaths: [...c.sourcePaths]
    })),
    blockers: [...BLOCKERS],
    nextSlice: {
      id: "EH-020",
      title: "Generated repository",
      focus: [
        "Full Next.js package with typed env and migrations",
        "Adapter manifest for Vercel and Docker builds",
        "Install/build from a clean directory without Relay runtime credentials"
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
