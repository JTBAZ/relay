import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const TEST_DATABASE_PREFIX = "relay_cp07_test_";
export const FIXED_TEST_FILE = "tests/conversational-planning/persistence-postgres.integration.test.ts";
const TEST_FILES_BY_SUITE = Object.freeze({
  cp07: FIXED_TEST_FILE,
  cp08: "tests/conversational-planning/api-postgres.integration.test.ts",
  cp09: "tests/conversational-planning/preparation-postgres.integration.test.ts"
});
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const HANDLE_STATE = new WeakMap();

export class HarnessError extends Error {
  constructor(code, databaseName = null) {
    super(code);
    this.name = "HarnessError";
    this.code = code;
    this.databaseName = databaseName;
  }
}

function safeFailure(code, databaseName = null) {
  return new HarnessError(code, databaseName);
}

function validateSuite(suite) {
  const selected = suite === undefined ? "cp07" : suite;
  if (typeof selected !== "string" || !Object.hasOwn(TEST_FILES_BY_SUITE, selected)) throw safeFailure("invalid_test_suite");
  return selected;
}

export function testFileForSuite(suite = "cp07") {
  return TEST_FILES_BY_SUITE[validateSuite(suite)];
}

/** Accept only the fixed CP-07 default or an explicit member of the closed suite set. */
export function parseHarnessArguments(argv) {
  if (!Array.isArray(argv)) return null;
  if (argv.length === 1 && argv[0] === "--run") return { suite: "cp07" };
  if (argv.length === 3 && argv[0] === "--run" && argv[1] === "--suite") {
    try { return { suite: validateSuite(argv[2]) }; }
    catch { return null; }
  }
  return null;
}

function normalizeLoopbackHost(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return host;
  return null;
}

function parseLocalPostgresUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw safeFailure("missing_bootstrap_url");
  let url;
  try { url = new URL(raw); }
  catch { throw safeFailure("invalid_bootstrap_url"); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw safeFailure("invalid_bootstrap_url");
  const host = normalizeLoopbackHost(url.hostname);
  if (!host) throw safeFailure("non_loopback_bootstrap");
  const allowedQueryKeys = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "connect_timeout", "application_name"]);
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.some(key => !allowedQueryKeys.has(key)) || new Set(queryKeys).size !== queryKeys.length) throw safeFailure("ambiguous_bootstrap_url");
  let databaseName;
  try { databaseName = decodeURIComponent(url.pathname.replace(/^\//, "")); }
  catch { throw safeFailure("invalid_bootstrap_url"); }
  if (!databaseName || databaseName.includes("/") || databaseName.includes("\0")) throw safeFailure("invalid_bootstrap_url");
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw safeFailure("invalid_bootstrap_url");
  return { url, host, port, databaseName };
}

export function makeTestDatabaseName(nonce = randomBytes(16).toString("hex")) {
  if (typeof nonce !== "string" || !NONCE_PATTERN.test(nonce)) throw safeFailure("invalid_nonce");
  return `${TEST_DATABASE_PREFIX}${nonce}`;
}

export function isTestDatabaseName(name) {
  return typeof name === "string" && name.startsWith(TEST_DATABASE_PREFIX) && NONCE_PATTERN.test(name.slice(TEST_DATABASE_PREFIX.length));
}

export function quotePostgresIdentifier(identifier) {
  if (typeof identifier !== "string" || !/^[a-z0-9_]{1,63}$/.test(identifier)) throw safeFailure("unsafe_database_identifier");
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlFor(parsed, databaseName) {
  const url = new URL(parsed.url.href);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.href;
}

function assertNotOrdinaryDatabase(parsedBootstrap, targetName, ordinaryRaw) {
  if (targetName === parsedBootstrap.databaseName || targetName.startsWith(TEST_DATABASE_PREFIX) && targetName === parsedBootstrap.databaseName) {
    throw safeFailure("ordinary_database_target_rejected", targetName);
  }
  if (typeof ordinaryRaw !== "string" || !ordinaryRaw.trim()) return;
  let ordinary;
  try { ordinary = new URL(ordinaryRaw); }
  catch { return; }
  let ordinaryName;
  try { ordinaryName = decodeURIComponent(ordinary.pathname.replace(/^\//, "")); }
  catch { return; }
  const ordinaryHost = normalizeLoopbackHost(ordinary.hostname);
  const ordinaryPort = ordinary.port ? Number(ordinary.port) : 5432;
  if (ordinaryHost && ordinaryHost === parsedBootstrap.host && ordinaryPort === parsedBootstrap.port && ordinaryName === targetName) {
    throw safeFailure("ordinary_database_target_rejected", targetName);
  }
}

async function defaultClientFactory(connectionString) {
  const { Client } = await import("pg");
  return new Client({ connectionString });
}

function maintenanceUrl(parsedBootstrap) {
  return databaseUrlFor(parsedBootstrap, "postgres");
}
function ownershipMarker(nonce) { return `relay_cp07_harness:${nonce}`; }

function validateHandle(handle) {
  if (!handle || typeof handle !== "object") throw safeFailure("unverified_cleanup_ownership");
  const state = HANDLE_STATE.get(handle);
  if (!state || handle.databaseName !== state.databaseName || handle.host !== state.host || handle.port !== state.port || handle.nonce !== state.nonce || !isTestDatabaseName(handle.databaseName)) {
    throw safeFailure("unverified_cleanup_ownership", typeof handle.databaseName === "string" && isTestDatabaseName(handle.databaseName) ? handle.databaseName : null);
  }
  return state;
}

/** Creates only a fresh, nonce-named database through a loopback maintenance connection. */
export async function createDisposableDatabase({
  bootstrapUrl,
  ordinaryDatabaseUrl,
  clientFactory = defaultClientFactory,
  nonce = randomBytes(16).toString("hex")
}) {
  const parsed = parseLocalPostgresUrl(bootstrapUrl);
  if (isTestDatabaseName(parsed.databaseName)) throw safeFailure("inherited_test_target_rejected", parsed.databaseName);
  const name = makeTestDatabaseName(nonce);
  assertNotOrdinaryDatabase(parsed, name, ordinaryDatabaseUrl);
  // Validate the exact identifier before any connection is opened.
  const quotedName = quotePostgresIdentifier(name);
  const client = await clientFactory(maintenanceUrl(parsed));
  let createAttempted = false;
  try {
    await client.connect();
    const existing = await client.query("SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1", [name]);
    if (existing.rows?.length) throw safeFailure("test_database_already_exists", name);
    createAttempted = true;
    await client.query(`CREATE DATABASE ${quotedName}`);
    await client.query(`COMMENT ON DATABASE ${quotedName} IS '${ownershipMarker(nonce)}'`);
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    // A disconnect during CREATE is ambiguous. Never guess ownership or drop it.
    throw safeFailure(createAttempted ? "database_creation_uncertain" : "database_create_failed", name);
  } finally {
    try { await client.end(); }
    catch { /* A closed or uncertain connection does not authorize a database drop. */ }
  }
  const handle = Object.freeze({ databaseName: name, host: parsed.host, port: parsed.port, nonce });
  HANDLE_STATE.set(handle, { databaseName: name, host: parsed.host, port: parsed.port, nonce, parsedBootstrap: parsed, clientFactory });
  return handle;
}

/** Returns the URL only in memory for passing directly to a fixed child process. */
export function getDisposableDatabaseUrl(handle) {
  const state = validateHandle(handle);
  assertNotOrdinaryDatabase(state.parsedBootstrap, state.databaseName, undefined);
  return databaseUrlFor(state.parsedBootstrap, state.databaseName);
}

/** Drops only a database created by this process after rechecking stored host/name/nonce provenance. */
export async function dropDisposableDatabase(handle, { clientFactory } = {}) {
  const state = validateHandle(handle);
  const factory = clientFactory ?? state.clientFactory;
  const { databaseName, host, port, nonce, parsedBootstrap } = state;
  if (!isTestDatabaseName(databaseName) || databaseName !== makeTestDatabaseName(nonce) || host !== parsedBootstrap.host || port !== parsedBootstrap.port) {
    throw safeFailure("unverified_cleanup_ownership", isTestDatabaseName(databaseName) ? databaseName : null);
  }
  const client = await factory(maintenanceUrl(parsedBootstrap));
  try {
    await client.connect();
    const found = await client.query("SELECT shobj_description(oid, 'pg_database') AS harness_marker FROM pg_catalog.pg_database WHERE datname = $1", [databaseName]);
    if (!found.rows?.length) {
      HANDLE_STATE.delete(handle);
      return { kind: "already_absent", databaseName };
    }
    if (found.rows[0].harness_marker !== ownershipMarker(nonce)) throw safeFailure("cleanup_uncertain", databaseName);
    // The validated nonce name is quoted as one SQL identifier; no cascade or FORCE cleanup.
    await client.query(`DROP DATABASE ${quotePostgresIdentifier(databaseName)}`);
    HANDLE_STATE.delete(handle);
    return { kind: "dropped", databaseName };
  } catch {
    throw safeFailure("cleanup_uncertain", databaseName);
  } finally {
    try { await client.end(); } catch { /* The safe outcome is to retain the DB for manual review. */ }
  }
}

function cleanChildEnvironment(baseEnv, databaseUrl, testChild) {
  const env = { ...baseEnv };
  const removedNames = new Set([
    "CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL", "CONVERSATIONAL_PLAN_TEST_DATABASE_URL",
    "DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "NODE_OPTIONS", "NODE_PATH"
  ]);
  // Windows environment names are case-insensitive; normalize before removing every alias.
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase();
    if (removedNames.has(normalized) || normalized.startsWith("PG") || normalized.startsWith("DOTENV_CONFIG_")) delete env[key];
  }
  // Prisma's dotenv/config must not overwrite the already-guarded child URL.
  env.DOTENV_CONFIG_QUIET = "true";
  // Prisma config and dotenv see only the fresh target, never the bootstrap database.
  env.DATABASE_URL = databaseUrl;
  if (testChild) env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL = databaseUrl;
  else delete env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL;
  return env;
}

export function fixedChildSpec(kind, suite = "cp07", root = REPO_ROOT) {
  const selectedSuite = validateSuite(suite);
  const executable = process.execPath;
  const prismaCli = resolve(root, "node_modules/prisma/build/index.js");
  const vitestCli = resolve(root, "node_modules/vitest/vitest.mjs");
  const args = kind === "migrate" ? [prismaCli, "migrate", "deploy"]
    : kind === "test" ? [vitestCli, "run", testFileForSuite(selectedSuite)]
    : (() => { throw safeFailure("invalid_child_kind"); })();
  return { executable, args };
}

function runFixedChild({ kind, databaseUrl, root, env, suite = "cp07" }) {
  const { executable, args } = fixedChildSpec(kind, suite, root);
  const child = spawnSync(executable, args, {
    cwd: root,
    env,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
    timeout: 5 * 60 * 1000
  });
  if (child.error || child.status !== 0) throw safeFailure(`${kind}_child_failed`);
}

/**
 * Opt-in local proof runner. The only child commands are this repository's
 * `prisma migrate deploy` and one fixed Vitest file; callers cannot supply shell code.
 */
export async function runDisposableDatabaseHarness({
  bootstrapUrl,
  ordinaryDatabaseUrl,
  env = process.env,
  clientFactory = defaultClientFactory,
  runChild = runFixedChild,
  nonce = randomBytes(16).toString("hex"),
  root = REPO_ROOT,
  suite
}) {
  const selectedSuite = validateSuite(suite);
  const handle = await createDisposableDatabase({ bootstrapUrl, ordinaryDatabaseUrl, clientFactory, nonce });
  const databaseUrl = getDisposableDatabaseUrl(handle);
  let failure = null;
  try {
    await runChild({ kind: "migrate", databaseUrl, root, env: cleanChildEnvironment(env, databaseUrl, false) });
    await runChild({ kind: "test", databaseUrl, root, env: cleanChildEnvironment(env, databaseUrl, true), suite: selectedSuite });
  } catch (error) {
    failure = error instanceof HarnessError ? error : safeFailure("child_failed");
  }
  try {
    await dropDisposableDatabase(handle);
  } catch {
    throw safeFailure("cleanup_uncertain", handle.databaseName);
  }
  if (failure) throw safeFailure(failure.code);
  return { kind: "passed", databaseName: handle.databaseName };
}

export async function runHarnessCli(argv, { loadEnv = loadDotenv, getEnv = () => process.env, runHarness = runDisposableDatabaseHarness } = {}) {
  const options = parseHarnessArguments(argv);
  if (!options) return { exitCode: 2, output: "Opt in explicitly with: node scripts/conversational-plan-test-db.mjs --run [--suite cp07|cp08|cp09]" };
  loadEnv({ quiet: true });
  const env = getEnv();
  const bootstrapUrl = env.CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL || env.DATABASE_URL;
  try {
    const result = await runHarness({ bootstrapUrl, ordinaryDatabaseUrl: env.DATABASE_URL, env, suite: options.suite });
    const label = options.suite === "cp07" ? "Disposable conversational-plan database proof" : options.suite === "cp08" ? "Disposable conversational-plan CP-08 database proof" : "Disposable conversational-plan CP-09 database proof";
    return { exitCode: 0, output: `${label} passed: ${result.databaseName}` };
  } catch (error) {
    const code = error instanceof HarnessError ? error.code : "harness_failed";
    const databaseName = error instanceof HarnessError ? error.databaseName : null;
    const label = options.suite === "cp07" ? "Disposable conversational-plan database proof" : options.suite === "cp08" ? "Disposable conversational-plan CP-08 database proof" : "Disposable conversational-plan CP-09 database proof";
    return { exitCode: 1, output: `${label} failed: ${code}${databaseName ? `; inspect ${databaseName} manually` : ""}` };
  }
}

async function main(argv) {
  const result = await runHarnessCli(argv);
  (result.exitCode === 0 ? process.stdout : process.stderr).write(`${result.output}\n`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
