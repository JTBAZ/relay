/**
 * EH-043 — OAuth choice / migration UX honesty contracts.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  buildManagedBoundedOutageCopy,
  buildOAuthChoiceDisclosures,
  buildPatreonVerificationHealthSummary,
  defaultOAuthChoiceSelection,
  observeManagedConnectorPrice,
  switchOffMigrationSteps
} from "../template/lib/patreon/oauth-choice.js";
import {
  buildSwitchOffResult,
  loadPatreonModePreference,
  savePatreonModePreference,
  switchOffToCreatorOAuth,
  PATREON_MODE_PREFERENCE_FILENAME
} from "../template/lib/patreon/mode-preference.js";
import { observeConnectorBilling } from "../template/lib/patreon/relay-managed/billing.js";

const TEMPLATE = join(__dirname, "..", "template");

describe("EH-043 status", () => {
  it("advances slice to EH-061 with next EH-062 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-061");
    expect(status.slice).toBe("EH-061");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-062");
    expect(status.nextSlice.title).toMatch(/appearance|connections|health/i);
    expect(status.blockers.some((b) => /belongs to EH-043/i.test(b))).toBe(
      false
    );
    const cap = status.capabilities.find(
      (c) => c.id === "oauth-choice-migration-ux"
    );
    expect(cap?.state).toBe("preview_only");
    expect(cap?.nextSlice).toBe("EH-062");
    expect(cap?.evidence).toMatch(/neither preselected|no managed|choice/i);
  });
});

describe("EH-043 choice UI / source contract", () => {
  it("never defaults managed selection", () => {
    expect(defaultOAuthChoiceSelection()).toBeNull();
    const choiceSrc = readFileSync(
      join(TEMPLATE, "components/admin/PatreonOAuthChoice.tsx"),
      "utf8"
    );
    expect(choiceSrc).toMatch(/selected === null/);
    expect(choiceSrc).toMatch(/Continue stays disabled/);
    // No defaultChecked on managed; checked only when selected === d.id
    expect(choiceSrc).not.toMatch(/defaultChecked/);
    expect(choiceSrc).not.toMatch(
      /checked=\{true\}|checked\s*=\s*\{\s*true\s*\}/
    );
    expect(choiceSrc).toMatch(/Own your Patreon connection/);
    expect(choiceSrc).toMatch(/Let Relay maintain it/);
  });

  it("ships disclosure copy for both paths including managed cancel/migration", () => {
    const disclosures = buildOAuthChoiceDisclosures({});
    expect(disclosures).toHaveLength(2);
    expect(disclosures[0]?.id).toBe("creator_oauth");
    expect(disclosures[1]?.id).toBe("relay_managed");
    for (const d of disclosures) {
      expect(d.dataHandled.length).toBeGreaterThan(0);
      expect(d.runtimeDependencies.length).toBeGreaterThan(0);
      expect(d.cancellationEffects.length).toBeGreaterThan(0);
      expect(d.migrationPath.length).toBeGreaterThan(0);
      expect(d.costDisclosure.length).toBeGreaterThan(0);
    }
    const managed = disclosures[1]!;
    expect(managed.costDisclosure).toMatch(/\$\d+\.\d{2}\/mo|relay_managed/);
    expect(managed.cancellationEffects.join(" ")).toMatch(/not deleted|stale/i);
    expect(managed.migrationPath.join(" ")).toMatch(/creator_oauth|rebuild/i);

    const price = observeManagedConnectorPrice({});
    expect(price.monthlyPriceCents).toBe(2900);
    expect(price.sku).toBe("relay_managed_patreon_connector");
  });

  it("choice page and admin surfaces exist without visitor chrome coupling", () => {
    const choicePage = readFileSync(
      join(TEMPLATE, "app/admin/patreon/choice/page.tsx"),
      "utf8"
    );
    expect(choicePage).toMatch(/PatreonOAuthChoice/);
    expect(choicePage).toMatch(/AdminShell/);
    expect(choicePage).not.toMatch(/PatronChrome/);
    const admin = readFileSync(
      join(TEMPLATE, "app/admin/patreon/page.tsx"),
      "utf8"
    );
    expect(admin).toMatch(/\/admin\/patreon\/choice/);
    expect(admin).toMatch(/buildPatreonVerificationHealthSummary/);
    expect(admin).toMatch(/PatreonModeSwitchOff/);
    expect(admin).toMatch(/EH-043/);
  });
});

describe("EH-043 mode preference + switch-off", () => {
  let kitDir: string;

  afterEach(() => {
    if (kitDir && existsSync(kitDir)) {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("persists explicit preference and fails closed on secret-looking keys", () => {
    kitDir = mkdtempSync(join(tmpdir(), "eh043-pref-"));
    mkdirSync(join(kitDir, "data"), { recursive: true });
    const empty = loadPatreonModePreference("site_a", kitDir);
    expect(empty.preferred_mode).toBeNull();
    expect(empty.production_safe).toBe(false);

    const saved = savePatreonModePreference(
      "site_a",
      "creator_oauth",
      kitDir,
      "2026-07-22T12:00:00.000Z"
    );
    expect(saved.preferred_mode).toBe("creator_oauth");
    expect(saved.note).toMatch(/Never store tokens/i);
    const raw = JSON.parse(
      readFileSync(join(kitDir, "data", PATREON_MODE_PREFERENCE_FILENAME), "utf8")
    ) as Record<string, unknown>;
    expect(raw).not.toHaveProperty("token");
    expect(raw).not.toHaveProperty("secret");

    // Corrupt with secret-looking key → fail closed to empty
    writeFileSync(
      join(kitDir, "data", PATREON_MODE_PREFERENCE_FILENAME),
      JSON.stringify({
        contract_version: "eh-patreon-mode-preference/1.0.0",
        site_id: "site_a",
        preferred_mode: "relay_managed",
        refresh_token: "leak",
        selected_at: null,
        switch_off_at: null,
        production_safe: false
      }),
      "utf8"
    );
    const rejected = loadPatreonModePreference("site_a", kitDir);
    expect(rejected.preferred_mode).toBeNull();
  });

  it("switch-off targets creator_oauth without rebuild and preserves patrons", () => {
    kitDir = mkdtempSync(join(tmpdir(), "eh043-switch-"));
    const result = buildSwitchOffResult("site_b", kitDir);
    expect(result.preference.preferred_mode).toBe("creator_oauth");
    expect(result.preference.switch_off_at).toBeTruthy();
    expect(result.patronsPreserved).toBe(true);
    expect(result.rebuildRequired).toBe(false);
    expect(result.envInstruction).toMatch(/ESCAPE_HATCH_PATREON_MODE=creator_oauth/);
    expect(result.productionSafe).toBe(false);

    const again = switchOffToCreatorOAuth("site_b", kitDir);
    expect(again.preferred_mode).toBe("creator_oauth");

    const steps = switchOffMigrationSteps("2026-08-15T00:00:00.000Z");
    expect(steps.join(" ")).toMatch(/2026-08-15/);
    expect(steps.join(" ")).toMatch(/not delete|patrons/i);
    expect(steps.join(" ")).toMatch(/no site rebuild|no rebuild/i);
  });
});

describe("EH-043 health / degraded managed honesty", () => {
  it("emits bounded outage copy when billing denied or kill switch off", () => {
    const billingDenied = observeConnectorBilling({
      ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS: "cancelled",
      ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE: "2026-09-01"
    });
    const copy = buildManagedBoundedOutageCopy({
      killSwitchOff: false,
      billing: billingDenied,
      relayConfigured: true
    });
    expect(copy).toMatch(/2026-09-01|not entitled|Bounded/i);
    expect(copy).toMatch(/not deleted|creator_oauth/i);

    const kill = buildManagedBoundedOutageCopy({
      killSwitchOff: true,
      billing: observeConnectorBilling({}),
      relayConfigured: true
    });
    expect(kill).toMatch(/kill switch|Bounded/i);

    const summary = buildPatreonVerificationHealthSummary({
      env: {
        ESCAPE_HATCH_PATREON_MODE: "relay_managed",
        ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS: "none"
      } as never,
      adapterImplementation: "relay_managed",
      healthOk: false,
      healthReason: "billing entitlement denied",
      preferredMode: "relay_managed"
    });
    expect(summary.productionSafe).toBe(false);
    expect(summary.boundedOutageCopy).toBeTruthy();
    expect(summary.staleWarning).toMatch(/stale|not deleted/i);
  });
});

describe("EH-043 docs", () => {
  it("documents preference file and choice routes in OPERATIONS + env example", () => {
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/EH-043/);
    expect(ops).toMatch(/patreon-mode-preference|\/admin\/patreon\/choice/);
    expect(ops).toMatch(/neither|not preselected|no default/i);
    const envEx = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(envEx).toMatch(/ESCAPE_HATCH_PATREON_MODE/);
    expect(envEx).toMatch(/EH-043|choice|preference/i);
  });
});
