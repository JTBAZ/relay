/**
 * EH-020 Generated repository chassis: clean-dir build contract, env/deploy
 * manifests, no Relay path imports, status EH-020 preserved under EH-022, productionSafe false.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  cpSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  GENERATED_CHASSIS_RELATIVE_PATHS,
  PACKAGE_ROOT,
  fillTemplate
} from "../src/fill-template.js";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  EnvValidationError,
  isPlaceholderSecret,
  loadEnv,
  requireEnv
} from "../template/lib/env.js";
import { createStubAdapters } from "../template/lib/adapters/index.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const RELAY_MONOREPO_IMPORT_RE =
  /from\s+["'](?:relay\/|@relay\/|file:\.\.\/\.\.|file:\.\.\/\.\.\/\.\.)/;

/** Credential-shaped Relay env names — not sentinel tier ids like RELAY_TIER_PUBLIC. */
const RELAY_CREDENTIAL_ENV_RE =
  /\bRELAY_(?:DATA_DIR|DATABASE_URL|API_KEY|SECRET|TOKEN|PAT|COOKIE)\b/;

const NEXT_MAINTENANCE_LTS_RE = /^15\.5\.\d+$/;

/**
 * Async npm spawn so a long clean-dir install/build does not block the Vitest
 * worker event loop (spawnSync >60s triggers birpc "onTaskUpdate" timeout).
 */
function runNpmAsync(
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(`npm ${args.join(" ")} timed out after ${opts.timeoutMs}ms`)
      );
    }, opts.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function collectSourceFiles(root: string, out: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === ".next" || name === "data") continue;
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("EH-020 status (preserved under EH-032)", () => {
  it("keeps generated-repository capability with productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-072");
    expect(status.slice).toBe("EH-072");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-073");
    expect(status.nextSlice.title).toMatch(/backup|restore/i);
    const cap = status.capabilities.find((c) => c.id === "generated-repository");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/clean directory|typed env|Dockerfile/i);
    expect(cap?.evidence).toMatch(/productionSafe remains false/i);
  });
});

describe("EH-020 generated chassis files", () => {
  it("ships required chassis paths in the template tree", () => {
    for (const rel of GENERATED_CHASSIS_RELATIVE_PATHS) {
      expect(existsSync(join(PACKAGE_ROOT, "template", rel))).toBe(true);
    }
  });

  it("pins Next Maintenance LTS 15.5.x with React 18", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "template", "package.json"), "utf8")
    ) as {
      dependencies: { next: string; react: string; "react-dom": string };
    };
    expect(pkg.dependencies.next).toMatch(NEXT_MAINTENANCE_LTS_RE);
    expect(pkg.dependencies.next).toBe("15.5.21");
    expect(pkg.dependencies.react).toMatch(/^18\./);
    expect(pkg.dependencies["react-dom"]).toMatch(/^18\./);
  });

  it("documents env names only in .env.example", () => {
    const example = readFileSync(
      join(PACKAGE_ROOT, "template", ".env.example"),
      "utf8"
    );
    expect(example).toMatch(/NEXT_PUBLIC_SITE_URL/);
    expect(example).toMatch(/DATABASE_URL/);
    expect(example).not.toMatch(/sk_live_|AKIA[0-9A-Z]{16}|eyJhbGci/);
    expect(example).toMatch(/NEVER commit real secrets/i);
    expect(example).not.toMatch(/ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW/);
  });

  it("lists deploy targets and env names in the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(PACKAGE_ROOT, "template", "escape-hatch.manifest.json"),
        "utf8"
      )
    ) as {
      productionSafe: boolean;
      deploy_targets: Array<{ id: string }>;
      optional_env_names: string[];
      required_env_names: string[];
      adapters: Record<string, { state: string }>;
    };
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.deploy_targets.map((t) => t.id).sort()).toEqual([
      "docker",
      "vercel"
    ]);
    expect(manifest.required_env_names).toEqual([]);
    expect(manifest.optional_env_names).toContain("DATABASE_URL");
    expect(manifest.optional_env_names).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(manifest.optional_env_names).not.toContain(
      "ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW"
    );
    expect(manifest.adapters.auth.state).toMatch(/preview|stub/i);
  });

  it("binds compose Postgres to loopback only with a dev-only password", () => {
    const compose = readFileSync(
      join(PACKAGE_ROOT, "template", "docker-compose.yml"),
      "utf8"
    );
    expect(compose).toMatch(/127\.0\.0\.1:5433:5432/);
    expect(compose).not.toMatch(/["']0\.0\.0\.0:5433:5432["']/);
    expect(compose).not.toMatch(/^\s*-\s*["']?5433:5432["']?\s*$/m);
    expect(compose).toMatch(/escape_hatch_dev_only/);
    expect(compose).toMatch(/do not expose|dev-only|Loopback only/i);
  });

  it("Dockerfile and OPERATIONS document private media honesty", () => {
    const dockerfile = readFileSync(
      join(PACKAGE_ROOT, "template", "Dockerfile"),
      "utf8"
    );
    const operations = readFileSync(
      join(PACKAGE_ROOT, "template", "OPERATIONS.md"),
      "utf8"
    );
    expect(dockerfile).toMatch(/private media|public\/media|productionSafe/i);
    expect(dockerfile).toMatch(/productionSafe:\s*false|not a production-safe/i);
    expect(operations).toMatch(/private media|public\/media|local_private/i);
    expect(operations).toMatch(/productionSafe|not production-safe/i);
    expect(operations).toMatch(/127\.0\.0\.1:5433/);
  });
});

describe("EH-020 fillTemplate chassis materialization", () => {
  it("copies chassis files and stamps manifest without Relay imports", () => {
    const bundle = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"), "utf8")
    );
    const result = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "eh-020-chassis-check",
      clean: true
    });

    for (const rel of GENERATED_CHASSIS_RELATIVE_PATHS) {
      expect(existsSync(join(result.outDir, rel))).toBe(true);
    }
    expect(existsSync(result.manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as {
      slice: string;
      productionSafe: boolean;
      generated_at: string | null;
      creator_id: string | null;
      site_id: string | null;
    };
    expect(manifest.slice).toBe("EH-072");
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.generated_at).toBeTruthy();
    expect(manifest.creator_id).toBeTruthy();
    expect(manifest.site_id).toBeTruthy();

    const pkg = JSON.parse(
      readFileSync(join(result.outDir, "package.json"), "utf8")
    ) as { dependencies: { next: string } };
    expect(pkg.dependencies.next).toMatch(NEXT_MAINTENANCE_LTS_RE);

    const sources = collectSourceFiles(result.outDir);
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(RELAY_MONOREPO_IMPORT_RE);
      expect(text).not.toMatch(/from\s+["'](?:\.\.\/){3,}src\//);
      expect(text).not.toMatch(RELAY_CREDENTIAL_ENV_RE);
      expect(text).not.toMatch(/["']C:\\Users\\/);
    }
  });
});

describe("EH-020 clean-directory build contract", () => {
  it(
    "npm install && npm run build succeeds without Relay root env",
    { timeout: 300_000 },
    async () => {
      const bundle = JSON.parse(
        readFileSync(
          join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"),
          "utf8"
        )
      );
      const generated = fillTemplate({
        bundle,
        mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
        slug: "eh-020-clean-build",
        clean: true
      });

      // Prefer a roomy temp root — Windows C: often lacks space for a fresh Next install.
      const tempRoots = [
        process.env.ESCAPE_HATCH_CLEAN_BUILD_TMP,
        "D:\\Temp",
        "D:\\tmp",
        join(PACKAGE_ROOT, ".tmp-clean-build"),
        tmpdir()
      ].filter((p): p is string => Boolean(p));

      let cleanDir: string | null = null;
      let lastErr: unknown;
      for (const root of tempRoots) {
        try {
          if (!existsSync(root)) {
            mkdirSync(root, { recursive: true });
          }
          cleanDir = mkdtempSync(join(root, "eh-020-clean-"));
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!cleanDir) {
        throw lastErr ?? new Error("Unable to allocate clean-build temp directory");
      }

      try {
        // Copy kit without node_modules / .next so install is truly clean.
        for (const name of readdirSync(generated.outDir)) {
          if (name === "node_modules" || name === ".next") continue;
          cpSync(join(generated.outDir, name), join(cleanDir, name), {
            recursive: true
          });
        }

        const env = {
          ...process.env,
          // Strip Relay / monorepo credential names if present.
          RELAY_DATA_DIR: undefined,
          RELAY_DATABASE_URL: undefined,
          DATABASE_URL: undefined,
          SUPABASE_URL: undefined,
          SUPABASE_ANON_KEY: undefined,
          SUPABASE_SERVICE_ROLE_KEY: undefined,
          R2_ACCESS_KEY_ID: undefined,
          R2_SECRET_ACCESS_KEY: undefined,
          STRIPE_SECRET_KEY: undefined,
          V0_API_KEY: undefined,
          NEXT_TELEMETRY_DISABLED: "1",
          CI: "1"
        };
        // Remove undefined keys for spawn clarity on Windows.
        for (const key of Object.keys(env)) {
          if ((env as Record<string, string | undefined>)[key] === undefined) {
            delete (env as Record<string, string | undefined>)[key];
          }
        }

        const install = await runNpmAsync(["install"], {
          cwd: cleanDir,
          env,
          timeoutMs: 180_000
        });
        expect(
          install.status,
          `npm install failed:\n${install.stdout}\n${install.stderr}`
        ).toBe(0);

        const build = await runNpmAsync(["run", "build"], {
          cwd: cleanDir,
          env,
          timeoutMs: 240_000
        });
        expect(
          build.status,
          `npm run build failed:\n${build.stdout}\n${build.stderr}`
        ).toBe(0);
        expect(existsSync(join(cleanDir, ".next"))).toBe(true);

        const resolvedPkg = JSON.parse(
          readFileSync(join(cleanDir, "node_modules", "next", "package.json"), "utf8")
        ) as { version: string };
        expect(resolvedPkg.version).toMatch(NEXT_MAINTENANCE_LTS_RE);

        const reactPkg = JSON.parse(
          readFileSync(
            join(cleanDir, "node_modules", "react", "package.json"),
            "utf8"
          )
        ) as { version: string };
        expect(reactPkg.version).toMatch(/^18\./);
      } finally {
        rmSync(cleanDir, { recursive: true, force: true });
      }
    }
  );
});

describe("EH-020 Docker availability note", () => {
  it("validates Dockerfile presence; docker build only if docker is available", () => {
    expect(existsSync(join(PACKAGE_ROOT, "template", "Dockerfile"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "template", ".dockerignore"))).toBe(
      true
    );

    const dockerCheck = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
      encoding: "utf8",
      shell: true,
      timeout: 15_000
    });
    if ((dockerCheck.status ?? 1) !== 0) {
      // Document skip — file/contract tests still cover the chassis.
      expect(dockerCheck.status).not.toBe(0);
      return;
    }

    // Optional smoke: do not fail the suite on slow CI docker; presence already asserted.
    // Full image build is left to EH-071 golden path when Docker is the verification target.
    expect(dockerCheck.stdout.trim().length).toBeGreaterThan(0);
  });
});

describe("EH-020 status source paths exist", () => {
  it("generated-repository sources resolve under the repo", () => {
    const cap = buildEscapeHatchStatus().capabilities.find(
      (c) => c.id === "generated-repository"
    );
    expect(cap).toBeTruthy();
    for (const sourcePath of cap!.sourcePaths) {
      expect(existsSync(join(REPO_ROOT, ...sourcePath.split("/")))).toBe(true);
    }
  });
});

describe("EH-020 requireEnv placeholder rejection", () => {
  const SECRET_KEYS = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET"
  ] as const;

  afterEach(() => {
    for (const key of SECRET_KEYS) {
      delete process.env[key];
    }
  });

  it("treats changeme / replace-me / empty-looking placeholders as missing", () => {
    expect(isPlaceholderSecret("changeme")).toBe(true);
    expect(isPlaceholderSecret("replace-me")).toBe(true);
    expect(isPlaceholderSecret("replace_me")).toBe(true);
    expect(isPlaceholderSecret("your_secret_here")).toBe(true);
    expect(isPlaceholderSecret("---")).toBe(true);
    expect(isPlaceholderSecret("")).toBe(true);
    expect(isPlaceholderSecret("   ")).toBe(true);
    expect(isPlaceholderSecret(undefined)).toBe(true);
    expect(isPlaceholderSecret("postgresql://eh:real-password@127.0.0.1:5433/eh")).toBe(
      false
    );

    process.env.DATABASE_URL = "changeme";
    expect(() => requireEnv(["DATABASE_URL"], "test")).toThrow(EnvValidationError);
    try {
      requireEnv(["DATABASE_URL"], "test");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).missing).toContain("DATABASE_URL");
    }

    process.env.DATABASE_URL = "replace-me";
    expect(() => requireEnv(["DATABASE_URL"], "test")).toThrow(EnvValidationError);

    process.env.STRIPE_SECRET_KEY = "sk_test_replace_me_placeholder";
    expect(() => requireEnv(["STRIPE_SECRET_KEY"], "test")).toThrow(
      EnvValidationError
    );

    process.env.DATABASE_URL =
      "postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch";
    const ok = requireEnv(["DATABASE_URL"], "test");
    expect(ok.DATABASE_URL).toContain("127.0.0.1:5433");
  });

  it("loadEnv stays non-throwing with empty env", () => {
    for (const key of SECRET_KEYS) {
      delete process.env[key];
    }
    const env = loadEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});

describe("EH-020 stub adapter health honesty", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.R2_BUCKET;
    delete process.env.R2_ENDPOINT;
  });

  it("never reports ok:true for stub/manifest adapters", async () => {
    process.env.DATABASE_URL =
      "postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch";
    process.env.R2_BUCKET = "eh-preview";
    process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";

    const adapters = createStubAdapters();
    const results = await Promise.all([
      adapters.auth.health(),
      adapters.database.health(),
      adapters.storage.health(),
      adapters.billing.health(),
      adapters.patreon.health(),
      adapters.email.health(),
      adapters.deployment.health()
    ]);

    for (const health of results) {
      expect(health.ok).toBe(false);
      if (!health.ok) {
        expect(health.reason.length).toBeGreaterThan(0);
        expect(health.reason).toMatch(
          /stub|preview-only|EH-0(30|33|40|41|50|51|70|71|72)/i
        );
      }
    }
    expect(adapters.deployment.listTargets()).toEqual(["vercel", "docker"]);
  });
});
