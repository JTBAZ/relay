/**
 * PILOT-017 — Pilot exit sign-off: verify script, checklist docs, UX gate wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const PRIOR_SIGNOFF_TESTS = [
  "tests/pilot-permission-signoff.test.ts",
  "tests/pilot-012-permission-guardrails.test.ts",
  "tests/pilot-013-manual-import-signoff.test.ts",
  "tests/pilot-014-relay-native-signoff.test.ts",
  "tests/pilot-015-analytics-action-center-signoff.test.ts",
  "tests/pilot-016-tenant-isolation-signoff.test.ts",
  "tests/pilot-ux-permission-parity.test.ts",
  "tests/pilot-contract-bundle.test.ts"
];

describe("PILOT-017 — Pilot exit sign-off", () => {
  it("package.json defines verify:pilot exit script", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["verify:pilot"]).toContain("npm run build");
    expect(pkg.scripts?.["verify:pilot"]).toContain("npm run test");
    expect(pkg.scripts?.["verify:pilot"]).toContain("npm run lint --prefix web");
    expect(pkg.scripts?.["verify:pilot"]).toContain("npm run build --prefix web");
  });

  it("exit checklist and browser matrix docs exist", () => {
    const checklist = readFileSync(join(ROOT, "docs/pilot-exit-checklist.md"), "utf8");
    const browser = readFileSync(join(ROOT, "docs/pilot-browser-matrix.md"), "utf8");
    expect(checklist).toContain("verify:pilot");
    expect(checklist).toContain("Stage 1 target");
    expect(browser).toContain("Chrome (desktop)");
    expect(browser).toContain("Blocking");
  });

  it("pilot-build-plan documents cohort success metrics", () => {
    const plan = readFileSync(join(ROOT, "docs/pilot-build-plan.md"), "utf8");
    expect(plan).toContain("Creators onboarded");
    expect(plan).toContain("Patrons active");
    expect(plan).toContain("verify:pilot");
  });

  it("pilot UX dev login documents gates A through J", () => {
    const login = readFileSync(join(ROOT, "docs/pilot-ux-dev-login.md"), "utf8");
    for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E", "Gate F", "Gate G", "Gate H", "Gate I", "Gate J", "Gate K"]) {
      expect(login).toContain(gate);
    }
  });

  it("prior PILOT/PUX sign-off test files are present", () => {
    for (const rel of PRIOR_SIGNOFF_TESTS) {
      readFileSync(join(ROOT, rel), "utf8");
    }
  });
});
