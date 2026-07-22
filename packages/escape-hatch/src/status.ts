/**
 * Deterministic Escape Hatch capability inventory (through EH-011).
 * No timestamps, env reads, network, or live data — informational only.
 */

export const ESCAPE_HATCH_STATUS_SCHEMA_VERSION = "escape-hatch-status/1.0.0";

export const ESCAPE_HATCH_SLICE = "EH-011";

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
    id: "EH-012";
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
      "fixture, wizard, build, from-relay, from-clone, import-relay-dump, and zip subcommands materialize a Next.js kit from fixtures or Relay adapters; suitable for local preview only.",
    sourcePaths: [
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/wizard.ts",
      "packages/escape-hatch/src/zip-kit.ts",
      "packages/escape-hatch/src/import/importer.ts"
    ],
    risk: "high",
    nextSlice: "EH-012"
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
      "fill-template copies every bundle media file into public/media, including member_only and tier_gated assets; direct HTTP GET to locked paths returns 200 with public bytes (known prototype security failure). EH-011 records media provenance/checksums but does not perform private R2 copy.",
    sourcePaths: ["packages/escape-hatch/src/fill-template.ts"],
    risk: "critical",
    nextSlice: "EH-012"
  },
  {
    id: "client-readable-bundle",
    title: "Public client-readable bundle and theme",
    state: "preview_only",
    evidence:
      "fill-template writes both data/site.json and data/theme.json and public/site.json and public/theme.json; the public copies are client-readable without server-side entitlement enforcement. Import provenance/local-state/report stay under data/ only.",
    sourcePaths: [
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/template/lib/load-site.ts",
      "packages/escape-hatch/template/lib/site-session.ts"
    ],
    risk: "high",
    nextSlice: "EH-020"
  },
  {
    id: "duplicate-contracts",
    title: "Versioned shared contracts",
    state: "preview_only",
    evidence:
      "SiteBundle and CloneSiteModel are explicitly versioned and runtime-validated; generated apps receive a byte-identical self-contained canonical contracts module and validate site.json before use. EH-011 adds separate versioned import-provenance / import-local-state / import-report documents.",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/types.ts",
      "packages/escape-hatch/src/fill-template.ts",
      "packages/escape-hatch/src/import/types.ts",
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
      "EH-010/EH-011 fixture matrix (MATRIX.json) covers sanitized OAuth/cookie Patreon JSON, SiteBundle/Clone adaptations, relay-dump import fixtures, promoted tombstone/legacy-tier families, and deferred AV/mature stubs for EH-012; secret/PII scan remains wired.",
    sourcePaths: [
      "packages/escape-hatch/fixtures/MATRIX.json",
      "packages/escape-hatch/fixtures/PROVENANCE.md",
      "packages/escape-hatch/fixtures/sample.bundle.json",
      "packages/escape-hatch/fixtures/clone-site.json",
      "packages/escape-hatch/fixtures/matrix/site-bundles/access-matrix.bundle.json",
      "packages/escape-hatch/src/fixture-scan.ts",
      "packages/escape-hatch/tests/escape-hatch-fixtures.test.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts",
      "tests/fixtures/patreon/oauth-list-post-text-only.json",
      "tests/fixtures/patreon/cookie-list-with-media.json"
    ],
    risk: "medium",
    nextSlice: "EH-012"
  },
  {
    id: "relay-dump-fixtures",
    title: "Relay-dump fixtures and importer tests",
    state: "preview_only",
    evidence:
      "fixtures/relay-dump/ drives import-relay-dump and automated idempotency/conflict/tombstone tests; checksum and byte-length fields are recorded in provenance. Private R2 stream copy remains EH-012.",
    sourcePaths: [
      "packages/escape-hatch/fixtures/relay-dump/canonical.json",
      "packages/escape-hatch/fixtures/relay-dump/exports/cr_eh_relay/export_index.json",
      "packages/escape-hatch/src/import/load-relay-dump.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts"
    ],
    risk: "medium",
    nextSlice: "EH-012"
  },
  {
    id: "relay-canonical-reuse",
    title: "Canonical ingest, clone, and export reuse",
    state: "reusable_relay_source",
    evidence:
      "Importer and from-relay load Relay dist clone-generator against canonical and export_index inputs; canonical ingest, clone tier-rules, and export types live in repo src/ and are reused, not reimplemented here.",
    sourcePaths: [
      "packages/escape-hatch/src/from-relay.ts",
      "packages/escape-hatch/src/from-clone.ts",
      "packages/escape-hatch/src/import/importer.ts",
      "src/ingest/types.ts",
      "src/ingest/canonical-store.ts",
      "src/clone/types.ts",
      "src/clone/tier-rules.ts",
      "src/export/types.ts"
    ],
    risk: "informational",
    nextSlice: "EH-012"
  },
  {
    id: "simplified-access-semantics",
    title: "Canonical-aligned preview access semantics",
    state: "preview_only",
    evidence:
      "The shared preview evaluator matches canonical paid/free, exact-tier, and tier-or-higher ordering semantics using serialized tier catalog data; it remains client-only soft gating and is not server authorization.",
    sourcePaths: [
      "packages/escape-hatch/src/contracts.ts",
      "packages/escape-hatch/src/access.ts",
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
      "No R2 private-read policy, signed URL gateway, or media-delivery enforcement in the generated app; Relay src/storage/media-delivery-policy.ts is not integrated.",
    sourcePaths: [
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
      "EH-011 importCanonical / import-relay-dump produce SiteBundle plus versioned provenance, local mutable state, conflict queue, and import report with idempotent replay; private R2 media migration remains EH-012. productionSafe is false.",
    sourcePaths: [
      "packages/escape-hatch/src/import/importer.ts",
      "packages/escape-hatch/src/import/load-relay-dump.ts",
      "packages/escape-hatch/src/import/types.ts",
      "packages/escape-hatch/src/cli.ts",
      "packages/escape-hatch/tests/escape-hatch-import.test.ts"
    ],
    risk: "high",
    nextSlice: "EH-012"
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
  "Premium (member_only and tier_gated) media bytes are copied to public/media and are directly fetchable without authentication.",
  "Direct HTTP GET to a locked premium media URL is expected to return HTTP 200 with public bytes; this is a known prototype security failure, not a passing paywall.",
  "Client demo persona state is non-authoritative; switching persona only changes UI gating, not server entitlements.",
  "Package preview access helpers align with canonical tier semantics but remain client-only and are not enforced server-side.",
  "Relay Part 2 billing and deploy adapters are synthetic stubs and must not be treated as production or provider proof.",
  "Passing package tests or a successful local preview does not make any soft-gated capability production-safe.",
  "EH-011 importer provenance does not imply private media delivery; R2 copy/verification is EH-012."
];

const BLOCKERS: string[] = [
  "Premium media remains world-readable in public/; migration/copy belongs to EH-012 and server-enforced private delivery belongs to EH-033.",
  "No hard patron identity, entitlements, or RLS-backed session (EH-030).",
  "Billing and deploy paths are stub-only in Relay core, not creator-owned production integrations (EH-050, EH-070).",
  "Video/audio/embed private blob migration and mature/legal-adult enforcement beyond accounted exclusions remain deferred to EH-012+."
];

export function buildEscapeHatchStatus(): EscapeHatchStatus {
  return {
    schemaVersion: ESCAPE_HATCH_STATUS_SCHEMA_VERSION,
    slice: ESCAPE_HATCH_SLICE,
    deliverable: "prototype_preview_only",
    productionSafe: false,
    summary:
      "Escape Hatch through EH-011 adds a canonical generated-app importer with immutable provenance, local mutable state, idempotent replay, and a conflict queue against sanitized relay-dump fixtures; locked premium bytes remain public, persona state is non-authoritative, and the prototype is not production safe.",
    prototypeWarnings: [...PROTOTYPE_WARNINGS],
    capabilities: CAPABILITIES.map((c) => ({
      ...c,
      sourcePaths: [...c.sourcePaths]
    })),
    blockers: [...BLOCKERS],
    nextSlice: {
      id: "EH-012",
      title: "R2 migration engine",
      focus: [
        "Creator-owned bucket setup and resumable stream copy",
        "Checksum verification, retry ledger, and private-read checks",
        "Replace prototype public/media premium copy for migrated objects"
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
