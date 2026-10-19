import { describe, expect, it, vi } from "vitest";
type HarnessApi = {
  createDisposableDatabase(args: Record<string, unknown>): Promise<any>;
  dropDisposableDatabase(handle: unknown, options?: Record<string, unknown>): Promise<any>;
  fixedChildSpec(kind: string, suite?: string, root?: string): { executable: string; args: string[] };
  getDisposableDatabaseUrl(handle: unknown): string;
  HarnessError: new (...args: any[]) => Error;
  isTestDatabaseName(name: string): boolean;
  makeTestDatabaseName(nonce?: string): string;
  parseHarnessArguments(argv: unknown): { suite: string } | null;
  quotePostgresIdentifier(identifier: string): string;
  runDisposableDatabaseHarness(args: Record<string, unknown>): Promise<any>;
  runHarnessCli(argv: unknown, dependencies?: Record<string, unknown>): Promise<{ exitCode: number; output: string }>;
  testFileForSuite(suite?: string): string;
};
const harness = await import(new URL("../../scripts/conversational-plan-test-db.mjs", import.meta.url).href) as HarnessApi;
const { createDisposableDatabase, dropDisposableDatabase, fixedChildSpec, getDisposableDatabaseUrl, HarnessError, isTestDatabaseName, makeTestDatabaseName, parseHarnessArguments, quotePostgresIdentifier, runDisposableDatabaseHarness, runHarnessCli, testFileForSuite } = harness;

const nonce = "0123456789abcdef0123456789abcdef";
const bootstrapUrl = "postgresql://local-user:local-secret@localhost:5432/relay_app?sslmode=disable";
const ordinaryName = "relay_app";
const harnessName = makeTestDatabaseName(nonce);

function fakeClientFactory({ existing = false, marker = `relay_cp07_harness:${nonce}` } = {}) {
  const calls: Array<{ url: string; sql: string; params?: unknown[] }> = [];
  const urls: string[] = [];
  let ended = 0;
  const factory = async (url: string) => {
    urls.push(url);
    return {
      async connect() {},
      async end() { ended += 1; },
      async query(sql: string, params?: unknown[]) {
        calls.push({ url, sql, params });
        if (/FROM pg_catalog\.pg_database/.test(sql)) {
          if (/shobj_description/.test(sql)) return { rows: marker === null ? [] : [{ harness_marker: marker }] };
          return { rows: existing ? [{ "?column?": 1 }] : [] };
        }
        return { rows: [] };
      }
    };
  };
  return { factory, calls, urls, get ended() { return ended; } };
}

async function rejectionCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "HarnessError", code });
}

describe("local disposable PostgreSQL harness safety", () => {
  it("accepts only a local bootstrap and rejects remote hosts before opening a client", async () => {
    const mocks = fakeClientFactory();
    await rejectionCode(createDisposableDatabase({
      bootstrapUrl: "postgresql://user:secret@db.example.test:5432/relay_app", clientFactory: mocks.factory, nonce
    }), "non_loopback_bootstrap");
    expect(mocks.urls).toEqual([]);
  });

  it("rejects endpoint aliases, case variants, and duplicate connection parameters", async () => {
    const mocks = fakeClientFactory();
    for (const suffix of [
      "hostaddr=127.0.0.1",
      "service=local",
      "Host=localhost",
      "sslmode=disable&sslmode=require"
    ]) {
      await rejectionCode(createDisposableDatabase({
        bootstrapUrl: `postgresql://user:secret@localhost:5432/relay_app?${suffix}`,
        clientFactory: mocks.factory,
        nonce
      }), "ambiguous_bootstrap_url");
    }
    expect(mocks.urls).toEqual([]);
  });

  it("rejects an inherited test database as bootstrap and rejects unsafe or non-test names", async () => {
    const mocks = fakeClientFactory();
    await rejectionCode(createDisposableDatabase({
      bootstrapUrl: `postgresql://user:secret@localhost:5432/${harnessName}`, clientFactory: mocks.factory, nonce
    }), "inherited_test_target_rejected");
    expect(isTestDatabaseName(harnessName)).toBe(true);
    expect(isTestDatabaseName("relay_app")).toBe(false);
    expect(() => makeTestDatabaseName("../relay_app")).toThrowError(HarnessError);
    expect(() => quotePostgresIdentifier('relay_app"; DROP DATABASE postgres')).toThrowError(HarnessError);
    expect(quotePostgresIdentifier(harnessName)).toBe(`"${harnessName}"`);
  });

  it("refuses a pre-existing nonce target without issuing CREATE or cleanup", async () => {
    const mocks = fakeClientFactory({ existing: true });
    await rejectionCode(createDisposableDatabase({ bootstrapUrl, clientFactory: mocks.factory, nonce }), "test_database_already_exists");
    expect(mocks.calls.some(call => /^CREATE DATABASE/.test(call.sql))).toBe(false);
    expect(mocks.calls.some(call => /^DROP DATABASE/.test(call.sql))).toBe(false);
    expect(mocks.ended).toBe(1);
  });

  it("never migrates the ordinary database and restricts child work to fixed commands", async () => {
    const mocks = fakeClientFactory();
    const children: Array<{ kind: string; databaseUrl: string; env: NodeJS.ProcessEnv; suite?: string }> = [];
    const result = await runDisposableDatabaseHarness({
      bootstrapUrl,
      ordinaryDatabaseUrl: bootstrapUrl,
      nonce,
      clientFactory: mocks.factory,
      env: {
        DATABASE_URL: bootstrapUrl,
        database_url: "postgresql://attacker/alternate",
        CONVERSATIONAL_PLAN_TEST_DATABASE_URL: "postgresql://attacker/other",
        conversational_plan_test_bootstrap_url: bootstrapUrl,
        CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL: bootstrapUrl,
        DIRECT_URL: bootstrapUrl,
        SHADOW_DATABASE_URL: bootstrapUrl,
        PGHOST: "remote.example.test",
        PGHOSTADDR: "203.0.113.9",
        PGSSLMODE: "disable",
        DOTENV_CONFIG_OVERRIDE: "true",
        DOTENV_CONFIG_PATH: "C:/attacker/.env",
        DOTENV_CONFIG_ENCODING: "attacker-encoding",
        NODE_OPTIONS: "--require attacker-hook.cjs",
        Node_Options: "--require mixed-case-hook.cjs",
        NODE_PATH: "C:/attacker/modules",
        Dotenv_Config_Override: "true",
        dotenv_config_path: "C:/attacker/mixed.env",
        PgHostAddr: "203.0.113.10",
        PATH: "C:/safe/bin"
      },
      runChild: async (child: { kind: string; databaseUrl: string; env: NodeJS.ProcessEnv; suite?: string }) => { children.push(child); }
    });
    expect(result).toEqual({ kind: "passed", databaseName: harnessName });
    expect(children.map(child => child.kind)).toEqual(["migrate", "test"]);
    expect(children[1].suite).toBe("cp07");
    expect(testFileForSuite(children[1].suite)).toBe("tests/conversational-planning/persistence-postgres.integration.test.ts");
    for (const child of children) {
      expect(new URL(child.databaseUrl).pathname).toBe(`/${harnessName}`);
      expect(child.env.DATABASE_URL).toBe(child.databaseUrl);
      expect(child.env.database_url).toBeUndefined();
      expect(new URL(child.env.DATABASE_URL!).pathname).not.toBe(`/${ordinaryName}`);
      expect(child.env.DATABASE_URL).not.toBe(bootstrapUrl);
      expect(child.env.CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL).toBeUndefined();
      expect(child.env.conversational_plan_test_bootstrap_url).toBeUndefined();
      expect(child.env.DIRECT_URL).toBeUndefined();
      expect(child.env.SHADOW_DATABASE_URL).toBeUndefined();
      expect(child.env.PGHOST).toBeUndefined();
      expect(child.env.PGHOSTADDR).toBeUndefined();
      expect(child.env.PgHostAddr).toBeUndefined();
      expect(child.env.PGSSLMODE).toBeUndefined();
      expect(child.env.DOTENV_CONFIG_OVERRIDE).toBeUndefined();
      expect(child.env.DOTENV_CONFIG_PATH).toBeUndefined();
      expect(child.env.DOTENV_CONFIG_ENCODING).toBeUndefined();
      expect(child.env.Dotenv_Config_Override).toBeUndefined();
      expect(child.env.dotenv_config_path).toBeUndefined();
      expect(child.env.DOTENV_CONFIG_QUIET).toBe("true");
      expect(child.env.NODE_OPTIONS).toBeUndefined();
      expect(child.env.Node_Options).toBeUndefined();
      expect(child.env.NODE_PATH).toBeUndefined();
      expect(child.env.PATH).toBe("C:/safe/bin");
    }
    expect(children[0].env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL).toBeUndefined();
    expect(children[1].env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL).toBe(children[1].databaseUrl);
    expect(mocks.calls.some(call => call.sql === `CREATE DATABASE "${harnessName}"`)).toBe(true);
    expect(mocks.calls.some(call => call.sql === `COMMENT ON DATABASE "${harnessName}" IS 'relay_cp07_harness:${nonce}'`)).toBe(true);
    expect(mocks.calls.some(call => call.sql === `DROP DATABASE "${harnessName}"`)).toBe(true);
    expect(mocks.ended).toBe(2);
  });

  it("selects only the fixed CP-08 API integration path while retaining migration and cleanup", async () => {
    const mocks = fakeClientFactory();
    const children: Array<{ kind: string; suite?: string }> = [];
    const result = await runDisposableDatabaseHarness({
      bootstrapUrl, ordinaryDatabaseUrl: bootstrapUrl, nonce, suite: "cp08", clientFactory: mocks.factory,
      env: { DATABASE_URL: bootstrapUrl }, runChild: async (child: { kind: string; suite?: string }) => { children.push(child); }
    });
    expect(result).toEqual({ kind: "passed", databaseName: harnessName });
    expect(children.map(child => child.kind)).toEqual(["migrate", "test"]);
    expect(children[1].suite).toBe("cp08");
    expect(testFileForSuite(children[1].suite)).toBe("tests/conversational-planning/api-postgres.integration.test.ts");
    expect(fixedChildSpec("test", "cp08").args.slice(-2)).toEqual(["run", "tests/conversational-planning/api-postgres.integration.test.ts"]);
    expect(fixedChildSpec("test", "cp07").args.slice(-2)).toEqual(["run", "tests/conversational-planning/persistence-postgres.integration.test.ts"]);
    expect(fixedChildSpec("migrate", "cp08").args.slice(-2)).toEqual(["migrate", "deploy"]);
    expect(() => fixedChildSpec("test", "constructor")).toThrowError(HarnessError);
    expect(() => fixedChildSpec("execute", "cp08")).toThrowError(HarnessError);
    expect(mocks.calls.some(call => call.sql === `CREATE DATABASE "${harnessName}"`)).toBe(true);
    expect(mocks.calls.some(call => call.sql === `DROP DATABASE "${harnessName}"`)).toBe(true);
  });

  it("selects only the fixed CP-09 preparation proof path", async () => {
    const mocks = fakeClientFactory();
    const children: Array<{ kind: string; suite?: string }> = [];
    const result = await runDisposableDatabaseHarness({
      bootstrapUrl, ordinaryDatabaseUrl: bootstrapUrl, nonce, suite: "cp09", clientFactory: mocks.factory,
      env: { DATABASE_URL: bootstrapUrl }, runChild: async (child: { kind: string; suite?: string }) => { children.push(child); }
    });
    expect(result).toEqual({ kind: "passed", databaseName: harnessName });
    expect(children.map(child => child.kind)).toEqual(["migrate", "test"]);
    expect(children[1].suite).toBe("cp09");
    expect(testFileForSuite("cp09")).toBe("tests/conversational-planning/preparation-postgres.integration.test.ts");
    expect(fixedChildSpec("test", "cp09").args.slice(-2)).toEqual(["run", "tests/conversational-planning/preparation-postgres.integration.test.ts"]);
    expect(fixedChildSpec("migrate", "cp09").args.slice(-2)).toEqual(["migrate", "deploy"]);
    expect(mocks.calls.some(call => call.sql === `CREATE DATABASE "${harnessName}"`)).toBe(true);
    expect(mocks.calls.some(call => call.sql === `COMMENT ON DATABASE "${harnessName}" IS 'relay_cp07_harness:${nonce}'`)).toBe(true);
    expect(mocks.calls.some(call => call.sql === `DROP DATABASE "${harnessName}"`)).toBe(true);
  });

  it("rejects malformed CLI arguments before dotenv, environment access, or database setup", async () => {
    const invalidArguments: unknown[][] = [
      [], ["--run", "--suite", "missing"], ["--run", "--suite", "../tests/evil.test.ts"],
      ["--run", "--suite", "constructor"], ["--run", "--suite", "toString"], ["--run", "--suite", "__proto__"],
      ["--run", "--suite", "cp08", "--suite", "cp07"], ["--run", "tests/conversational-planning/api-postgres.integration.test.ts"],
      ["--suite", "cp08", "--run"], ["--run", "--suite"]
    ];
    const loadEnv = vi.fn(), getEnv = vi.fn(() => ({ DATABASE_URL: bootstrapUrl })), runHarness = vi.fn();
    for (const args of invalidArguments) {
      expect(parseHarnessArguments(args)).toBeNull();
      expect(await runHarnessCli(args, { loadEnv, getEnv, runHarness })).toMatchObject({ exitCode: 2 });
    }
    expect(loadEnv).not.toHaveBeenCalled();
    expect(getEnv).not.toHaveBeenCalled();
    expect(runHarness).not.toHaveBeenCalled();
    expect(parseHarnessArguments(["--run"])).toEqual({ suite: "cp07" });
    expect(parseHarnessArguments(["--run", "--suite", "cp07"])).toEqual({ suite: "cp07" });
    expect(parseHarnessArguments(["--run", "--suite", "cp08"])).toEqual({ suite: "cp08" });
    expect(parseHarnessArguments(["--run", "--suite", "cp09"])).toEqual({ suite: "cp09" });
    const loadAllowed = vi.fn(), getAllowedEnv = vi.fn(() => ({ DATABASE_URL: bootstrapUrl }));
    const runAllowed = vi.fn(async () => ({ kind: "passed", databaseName: harnessName }));
    const accepted = await runHarnessCli(["--run", "--suite", "cp08"], { loadEnv: loadAllowed, getEnv: getAllowedEnv, runHarness: runAllowed });
    expect(accepted).toMatchObject({ exitCode: 0 });
    expect(loadAllowed).toHaveBeenCalledOnce();
    expect(runAllowed).toHaveBeenCalledWith(expect.objectContaining({ suite: "cp08" }));
    const runCp09 = vi.fn(async () => ({ kind: "passed", databaseName: harnessName }));
    const acceptedCp09 = await runHarnessCli(["--run", "--suite", "cp09"], { loadEnv: vi.fn(), getEnv: getAllowedEnv, runHarness: runCp09 });
    expect(acceptedCp09).toMatchObject({ exitCode: 0, output: expect.stringContaining("CP-09") });
    expect(runCp09).toHaveBeenCalledWith(expect.objectContaining({ suite: "cp09" }));
  });

  it("rejects invalid programmatic suite values before opening a bootstrap client", async () => {
    const mocks = fakeClientFactory();
    for (const suite of ["missing", "../tests/evil.test.ts", "constructor", "toString", "__proto__", null]) {
      await rejectionCode(runDisposableDatabaseHarness({ bootstrapUrl, ordinaryDatabaseUrl: bootstrapUrl, nonce, suite, clientFactory: mocks.factory }), "invalid_test_suite");
    }
    expect(mocks.urls).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });

  it("refuses cleanup without its unforgeable in-process handle and refuses changed ownership markers", async () => {
    const untouched = fakeClientFactory();
    await rejectionCode(dropDisposableDatabase({ databaseName: harnessName, host: "localhost", port: 5432, nonce }, { clientFactory: untouched.factory }), "unverified_cleanup_ownership");
    expect(untouched.urls).toEqual([]);

    const mismatched = fakeClientFactory({ marker: "different-harness-owner" });
    const handle = await createDisposableDatabase({ bootstrapUrl, clientFactory: mismatched.factory, nonce });
    await rejectionCode(dropDisposableDatabase(handle), "cleanup_uncertain");
    expect(mismatched.calls.some(call => /^DROP DATABASE/.test(call.sql))).toBe(false);
    expect(mismatched.ended).toBe(2);
  });

  it("drops only the exact database created by this harness and reports only redacted child failures", async () => {
    const mocks = fakeClientFactory();
    const handle = await createDisposableDatabase({ bootstrapUrl, clientFactory: mocks.factory, nonce });
    expect(new URL(getDisposableDatabaseUrl(handle)).pathname).toBe(`/${harnessName}`);
    const dropped = await dropDisposableDatabase(handle);
    expect(dropped).toEqual({ kind: "dropped", databaseName: harnessName });
    expect(mocks.calls.filter(call => /^DROP DATABASE/.test(call.sql)).map(call => call.sql)).toEqual([`DROP DATABASE "${harnessName}"`]);

    const failureMocks = fakeClientFactory();
    const secretError = new Error(`child failed at ${bootstrapUrl}`);
    const runChild = vi.fn(async (child: { kind: string }) => { if (child.kind === "test") throw secretError; });
    let thrown: unknown;
    try {
      await runDisposableDatabaseHarness({ bootstrapUrl, ordinaryDatabaseUrl: bootstrapUrl, nonce, suite: "cp08", clientFactory: failureMocks.factory, runChild });
    } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({ name: "HarnessError", code: "child_failed" });
    expect(String(thrown)).not.toContain("local-secret");
    expect(String(thrown)).not.toContain(bootstrapUrl);
    expect(runChild.mock.calls.map(([child]) => child.kind)).toEqual(["migrate", "test"]);
    expect(failureMocks.calls.some(call => /^DROP DATABASE/.test(call.sql))).toBe(true);
  });
});
