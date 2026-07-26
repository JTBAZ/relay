/**
 * EH-080 — Ownership packet (manifesto, env-name inventory, warranty).
 */

import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";
import {
  assessOwnershipReadiness,
  buildCredentialInventory,
  generateOwnershipPacket,
  ownershipPacketContainsSecrets
} from "../template/lib/ownership/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_MANIFEST = join(
  HERE,
  "..",
  "template",
  "escape-hatch.manifest.json"
);

function seedKitDir(): string {
  const kitDir = mkdtempSync(join(tmpdir(), "eh080-"));
  mkdirSync(join(kitDir, "data"), { recursive: true });
  copyFileSync(TEMPLATE_MANIFEST, join(kitDir, "escape-hatch.manifest.json"));
  writeFileSync(
    join(kitDir, "OWNERSHIP.md"),
    "# Ownership\ncreator-owned\n",
    "utf8"
  );
  writeFileSync(join(kitDir, "OPERATIONS.md"), "# Ops\n", "utf8");
  return kitDir;
}

describe("EH-080 status", () => {
  it("advances slice to EH-082 with next HUMAN-SIGNOFF and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-082");
    expect(status.slice).toBe("EH-082");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("HUMAN-SIGNOFF");
    expect(status.nextSlice.title).toMatch(/human|sign[- ]?off|release/i);
  });
});

describe("EH-080 ownership packet", () => {
  it("builds credential inventory with env names only", () => {
    const rows = buildCredentialInventory();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((r) => r.env_name === "STRIPE_SECRET_KEY")).toBe(true);
    expect(rows.every((r) => !/\s/.test(r.env_name))).toBe(true);
    expect(
      rows.some((r) => r.ownership === "optional_relay")
    ).toBe(true);
  });

  it("generates packet without secrets and writes artifacts", () => {
    const kitDir = seedKitDir();
    try {
      const now = new Date("2026-07-23T20:00:00.000Z");
      const result = generateOwnershipPacket({
        siteId: "site_eh_080",
        kitDir,
        now
      });
      expect(result.ok).toBe(true);
      expect(result.packet).not.toBeNull();
      expect(result.production_safe).toBe(false);
      expect(ownershipPacketContainsSecrets(result.packet!)).toBe(false);
      expect(result.packet!.credentials.length).toBeGreaterThan(0);
      expect(result.packet!.warranty.days).toBe(90);
      expect(result.packet!.independence.live_independence_proof).toBe(
        "local_native_passed_live_provider_open"
      );
      expect(result.packet!.optional_relay_services.every((s) => !s.required_for_native_ops)).toBe(
        true
      );

      const json = readFileSync(
        join(kitDir, "data", "ownership-packet", "ownership-packet.json"),
        "utf8"
      );
      expect(json).not.toMatch(/sk_live_|whsec_/);
      expect(json).toMatch(/escape-hatch-ownership-packet/);
      expect(
        readFileSync(
          join(kitDir, "data", "ownership-packet", "OWNERSHIP_PACKET.md"),
          "utf8"
        )
      ).toMatch(/Manifesto|Warranty/i);

      const readiness = assessOwnershipReadiness({
        siteId: "site_eh_080",
        kitDir
      });
      expect(readiness.ok).toBe(true);
      expect(readiness.packet_generated).toBe(true);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("wires Health ownership item", () => {
    const kitDir = seedKitDir();
    try {
      generateOwnershipPacket({ siteId: "site_eh_080", kitDir });
      const readiness = assessOwnershipReadiness({
        siteId: "site_eh_080",
        kitDir
      });
      const items = buildHealthItems({
        adapters: [],
        blockers: [],
        manifestSlice: "EH-082",
        publicMediaHonesty: "test",
        ownershipReadiness: readiness
      });
      expect(items.some((i) => i.id === "ownership_packet")).toBe(true);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
