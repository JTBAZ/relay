/**
 * Build + persist ownership packet (EH-080).
 * No secrets, no patron PII — productionSafe false.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { readManifestVersions } from "../backup/compatibility";
import { loadLaunchWizardState } from "../deploy/launch-wizard-state";
import { buildCredentialInventory } from "./inventory";
import {
  OWNERSHIP_PACKET_CONTRACT,
  WARRANTY_DAYS,
  type OwnershipPacketDocument,
  type OwnershipPacketStateDocument,
  type OptionalRelayDisclosure,
  type WarrantyBoundary
} from "./types";

function statePath(kitDir: string): string {
  return join(kitDir, "data", "ownership-packet-state.json");
}

function packetDir(kitDir: string): string {
  return join(kitDir, "data", "ownership-packet");
}

export function emptyOwnershipState(
  siteId: string
): OwnershipPacketStateDocument {
  return {
    contract_version: "escape-hatch-ownership-state/1.0.0",
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    last_generated_at: null,
    packet_path: null,
    last_error: null
  };
}

export function loadOwnershipState(
  siteId: string,
  kitDir = process.cwd()
): OwnershipPacketStateDocument {
  const path = statePath(kitDir);
  if (!existsSync(path)) return emptyOwnershipState(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<OwnershipPacketStateDocument>;
    if (raw.contract_version !== "escape-hatch-ownership-state/1.0.0") {
      return emptyOwnershipState(siteId);
    }
    return {
      contract_version: "escape-hatch-ownership-state/1.0.0",
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      last_generated_at:
        typeof raw.last_generated_at === "string"
          ? raw.last_generated_at
          : null,
      packet_path:
        typeof raw.packet_path === "string" ? raw.packet_path : null,
      last_error: typeof raw.last_error === "string" ? raw.last_error : null
    };
  } catch {
    return emptyOwnershipState(siteId);
  }
}

export function saveOwnershipState(
  doc: OwnershipPacketStateDocument,
  kitDir = process.cwd()
): void {
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    statePath(kitDir),
    `${JSON.stringify({ ...doc, production_safe: false }, null, 2)}\n`,
    "utf8"
  );
}

function warranty(now: Date): WarrantyBoundary {
  const end = new Date(now.getTime() + WARRANTY_DAYS * 24 * 60 * 60 * 1000);
  return {
    handoff_at: now.toISOString(),
    warranty_ends_at: end.toISOString(),
    days: WARRANTY_DAYS,
    covered: [
      "Delivery defects in the Escape Hatch chassis as handed off",
      "Documented adapter wiring that fails closed incorrectly against the contract"
    ],
    excluded: [
      "Creator customizations and content",
      "Provider/policy changes after handoff",
      "Feature work and dependency modernization",
      "Day-to-day operations, DNS, and live billing disputes"
    ],
    paid_support_note:
      "Paid maintenance / support is a separate agreement — not included in the 90-day defect warranty."
  };
}

function optionalRelay(): OptionalRelayDisclosure[] {
  return [
    {
      id: "relay_crosspost",
      title: "Relay Crosspost API",
      required_for_native_ops: false,
      revocable: true,
      detail:
        "Optional scoped bearer tokens for inbound drafts/publish. Revoke on /admin/crosspost. Native CMS publishing continues without Crosspost."
    },
    {
      id: "relay_managed_patreon",
      title: "Relay-managed Patreon verification",
      required_for_native_ops: false,
      revocable: true,
      detail:
        "Optional managed verify + connector billing entitlement. Switch to creator_oauth without rebuild; patrons preserved. Not required for native identity/billing."
    }
  ];
}

function listArtifactPaths(kitDir: string): string[] {
  const candidates = [
    "escape-hatch.manifest.json",
    "OWNERSHIP.md",
    "OPERATIONS.md",
    "data/backup-state.json",
    "data/deploy-state.json",
    "data/launch-wizard-state.json",
    "data/library-parity-report.json"
  ];
  return candidates.filter((p) => existsSync(join(kitDir, p)));
}

export function buildOwnershipPacket(opts: {
  siteId: string;
  kitDir?: string;
  now?: Date;
}): OwnershipPacketDocument | null {
  const kitDir = opts.kitDir ?? process.cwd();
  const now = opts.now ?? new Date();
  const versions = readManifestVersions(kitDir);
  if (!versions) return null;

  const artifact_paths = listArtifactPaths(kitDir);

  return {
    contract_version: OWNERSHIP_PACKET_CONTRACT,
    site_id: opts.siteId,
    generated_at: now.toISOString(),
    production_safe: false,
    manifesto: {
      title: "Creator ownership manifesto",
      bullets: [
        "You own imported/normalized data and media in this kit.",
        "You own the generated application instance and configuration.",
        "You own domain and provider accounts you configure.",
        "You own the site customer relationship and independent billing data.",
        "You have the right to run, modify, migrate, and self-host this delivered copy."
      ],
      relay_chassis_rights:
        "Relay retains reusable generator/chassis rights. This packet does not transfer Relay Studio source.",
      creator_license:
        "Creator receives a perpetual package license to operate and modify the delivered Escape Hatch site copy."
    },
    source_package: {
      chassis_version: versions.chassis_version,
      schema_version: versions.schema_version,
      slice: versions.slice,
      manifest_path: "escape-hatch.manifest.json",
      build_commands: ["npm install", "npm run build"],
      test_commands: ["npx vitest run (from packages/escape-hatch in monorepo)"],
      ops_doc: "OPERATIONS.md",
      ownership_doc: "OWNERSHIP.md"
    },
    data_media_inventory: {
      note:
        "Fixture inventory lists artifact paths only. Patron/customer PII exports are separated and never embedded here.",
      artifact_paths,
      parity_report_present: artifact_paths.includes(
        "data/library-parity-report.json"
      ),
      patron_pii_excluded: true
    },
    credentials: buildCredentialInventory(),
    optional_relay_services: optionalRelay(),
    independence: {
      native_without_relay:
        "Native publishing, identity (Path A/B), billing adapters, private media, email, admin, backup, and deploy rehearsals operate without Relay Studio.",
      optional_addons:
        "Crosspost and Relay-managed Patreon are optional, disclosed, and revocable — not required for daily ops.",
      live_independence_proof: "deferred_eh_082"
    },
    warranty: warranty(now),
    operating_guide_pointers: [
      "OPERATIONS.md — identity, entitlements, media, deploy, email, backup, launch wizard",
      "/admin/health — actionable adapter and ops checklist",
      "/admin/deploy — Path A/B fixtures + EH-074 launch wizard",
      "scripts/backup.md, scripts/restore.md, scripts/update.md — kit-local recovery stubs"
    ],
    redaction_note:
      "This packet lists environment variable names and inventory paths only. No secrets, tokens, service-role keys, or patron PII. productionSafe remains false."
  };
}

export type GeneratePacketResult = {
  ok: boolean;
  packet: OwnershipPacketDocument | null;
  state: OwnershipPacketStateDocument;
  error: string | null;
  production_safe: false;
};

/**
 * Write packet JSON + markdown summary under data/ownership-packet/.
 */
export function generateOwnershipPacket(opts: {
  siteId: string;
  kitDir?: string;
  now?: Date;
}): GeneratePacketResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const packet = buildOwnershipPacket(opts);
  let state = loadOwnershipState(opts.siteId, kitDir);

  if (!packet) {
    state = {
      ...state,
      last_error: "manifest_unreadable",
      updated_at: new Date().toISOString()
    };
    saveOwnershipState(state, kitDir);
    return {
      ok: false,
      packet: null,
      state,
      error: "manifest_unreadable",
      production_safe: false
    };
  }

  const dir = packetDir(kitDir);
  mkdirSync(dir, { recursive: true });
  const jsonRel = "data/ownership-packet/ownership-packet.json";
  const mdRel = "data/ownership-packet/OWNERSHIP_PACKET.md";
  writeFileSync(
    join(kitDir, jsonRel),
    `${JSON.stringify(packet, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(join(kitDir, mdRel), renderPacketMarkdown(packet), "utf8");

  state = {
    ...state,
    last_generated_at: packet.generated_at,
    packet_path: jsonRel,
    last_error: null,
    updated_at: packet.generated_at
  };
  saveOwnershipState(state, kitDir);

  return {
    ok: true,
    packet,
    state,
    error: null,
    production_safe: false
  };
}

export function renderPacketMarkdown(packet: OwnershipPacketDocument): string {
  const lines: string[] = [
    `# Ownership packet`,
    ``,
    `Generated: ${packet.generated_at}`,
    `Site: ${packet.site_id}`,
    `productionSafe: false`,
    ``,
    `## 1. Manifesto`,
    ``,
    ...packet.manifesto.bullets.map((b) => `- ${b}`),
    ``,
    packet.manifesto.relay_chassis_rights,
    ``,
    packet.manifesto.creator_license,
    ``,
    `## 2. Source package`,
    ``,
    `- Chassis: ${packet.source_package.chassis_version}`,
    `- Schema: ${packet.source_package.schema_version}`,
    `- Slice: ${packet.source_package.slice}`,
    `- Build: ${packet.source_package.build_commands.join("; ")}`,
    `- Ops: ${packet.source_package.ops_doc}`,
    ``,
    `## 3. Data / media inventory`,
    ``,
    packet.data_media_inventory.note,
    ``,
    ...packet.data_media_inventory.artifact_paths.map((p) => `- ${p}`),
    ``,
    `## 4. Credentials inventory (names only)`,
    ``,
    ...packet.credentials.map(
      (c) =>
        `- \`${c.env_name}\` — ${c.purpose} (${c.ownership}; cost: ${c.estimated_cost_owner})`
    ),
    ``,
    `## 5. Operating guide pointers`,
    ``,
    ...packet.operating_guide_pointers.map((p) => `- ${p}`),
    ``,
    `## 6. Optional Relay services`,
    ``,
    ...packet.optional_relay_services.map(
      (s) => `- **${s.title}** — ${s.detail}`
    ),
    ``,
    `## 7. Independence`,
    ``,
    packet.independence.native_without_relay,
    ``,
    packet.independence.optional_addons,
    ``,
    `Live remove-Relay independence proof: deferred to EH-082.`,
    ``,
    `## 8. Warranty (${packet.warranty.days} days)`,
    ``,
    `- Handoff: ${packet.warranty.handoff_at}`,
    `- Ends: ${packet.warranty.warranty_ends_at}`,
    `- Covered: ${packet.warranty.covered.join("; ")}`,
    `- Excluded: ${packet.warranty.excluded.join("; ")}`,
    ``,
    packet.warranty.paid_support_note,
    ``,
    `---`,
    packet.redaction_note,
    ``
  ];
  return lines.join("\n");
}

/** Fail closed if secret-shaped material appears in packet JSON. */
export function ownershipPacketContainsSecrets(
  packet: OwnershipPacketDocument
): boolean {
  const json = JSON.stringify(packet);
  if (/sk_live_|sk_test_|whsec_|re_[A-Za-z0-9]{16,}/i.test(json)) return true;
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(json)) return true;
  if (/"password"\s*:\s*"[^[]/i.test(json)) return true;
  // Ensure we never embedded env *values* — credentials rows must only have env_name keys we expect.
  for (const row of packet.credentials) {
    if (/\s/.test(row.env_name)) return true;
    if (row.env_name.length > 80) return true;
  }
  return false;
}

export function launchCompleteHint(
  siteId: string,
  kitDir = process.cwd()
): boolean {
  const launch = loadLaunchWizardState(siteId, kitDir);
  return Boolean(launch.launch_completed_at);
}
