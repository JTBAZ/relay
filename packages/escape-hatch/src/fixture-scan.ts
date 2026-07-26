/**
 * Deterministic secret / PII scanner for Escape Hatch fixtures (EH-010).
 * Fail-closed: any match outside the documented allowlist is a failure.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type FixtureScanFinding = {
  file: string;
  ruleId: string;
  detail: string;
  line: number;
};

export type FixtureScanResult = {
  scannedFiles: number;
  findings: FixtureScanFinding[];
};

/**
 * Documented synthetic hosts / domains that may appear in fixtures.
 * URL host checks use `hosts` (exact match after stripping port/userinfo).
 * Email checks use `emailDomains` against the matched address only.
 */
export const FIXTURE_SCAN_ALLOWLIST = {
  hosts: [
    "cdn.fixture.example",
    "media.fixture.example",
    "example.com",
    "localhost",
    "127.0.0.1",
    /** SVG xmlns namespace used by placeholder media. */
    "www.w3.org"
  ],
  emailDomains: ["fixture.example", "example.com"]
} as const;

const OBVIOUS_TOKEN_PLACEHOLDERS = new Set([
  "",
  "fixture",
  "redacted",
  "example",
  "placeholder"
]);

type ScanRule = {
  id: string;
  description: string;
  pattern: RegExp;
  /** Return true to ignore this match (allowlisted). */
  allow?: (match: string, line: string) => boolean;
};

function emailDomainAllowed(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const domain = address.slice(at + 1).toLowerCase();
  return FIXTURE_SCAN_ALLOWLIST.emailDomains.some((d) => d.toLowerCase() === domain);
}

function extractAssignedValue(match: string): string | null {
  const m = /[:=]\s*['"]([^'"]*)['"]/.exec(match);
  if (!m) return null;
  return m[1].trim();
}

function isObviousTokenPlaceholder(match: string): boolean {
  const value = extractAssignedValue(match);
  if (value === null) return false;
  const lower = value.toLowerCase();
  if (OBVIOUS_TOKEN_PLACEHOLDERS.has(lower)) return true;
  // Synthetic fixture ids only (fixture_*, fixture-*)
  return /^fixture[_-][a-z0-9._-]*$/i.test(value);
}

function urlHostAllowed(urlMatch: string): boolean {
  const withoutScheme = urlMatch.replace(/^https?:\/\//i, "");
  const authority = withoutScheme.split(/[/?#]/)[0] ?? "";
  if (!authority) return false;
  const hostPort = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  const host = hostPort.replace(/:\d+$/, "").toLowerCase();
  if (!host) return false;
  return FIXTURE_SCAN_ALLOWLIST.hosts.some((h) => h.toLowerCase() === host);
}

const RULES: ScanRule[] = [
  {
    id: "bearer-token",
    description: "Authorization Bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi
  },
  {
    id: "stripe-secret",
    description: "Stripe live/test secret key",
    pattern: /\bsk_(live|test)_[A-Za-z0-9]{8,}\b/g
  },
  {
    id: "patreon-token-like",
    description: "Patreon-looking access token",
    pattern: /\b(patreon[_-]?access[_-]?token|PAQ[A-Za-z0-9_-]{20,})\b/gi
  },
  {
    id: "oauth-token-assignment",
    description: "OAuth access/refresh/token assignment",
    // Allow optional quotes around the key (JSON) before :/=.
    pattern:
      /\b(access_token|refresh_token|accessToken|refreshToken|token)\b\s*["']?\s*[:=]\s*["'][^"']*["']/gi,
    allow: (match) => isObviousTokenPlaceholder(match)
  },
  {
    id: "session-cookie",
    description: "Session cookie assignment",
    pattern:
      /\b(session|sessionid|connect\.sid|__session|patreon_device_id)\s*=\s*['"]?[A-Za-z0-9._\-]{8,}/gi
  },
  {
    id: "private-key-pem",
    description: "Private key PEM block",
    pattern: /-----BEGIN ([A-Z0-9 ]+)?PRIVATE KEY-----/g
  },
  {
    id: "aws-access-key",
    description: "AWS access key id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    id: "aws-secret-like",
    description: "AWS/R2 secret access key assignment",
    pattern:
      /\b(aws_secret_access_key|secret_access_key|r2_secret_access_key)\s*[:=]\s*['"][^'"]{8,}/gi
  },
  {
    id: "jwt-like",
    description: "JWT-looking triple",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    id: "email",
    description: "Email address",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    allow: (match) => emailDomainAllowed(match)
  },
  {
    id: "url-host",
    description: "Non-allowlisted URL host",
    pattern: /\bhttps?:\/\/[^\s"'<>\\]+/gi,
    allow: (match) => urlHostAllowed(match)
  },
  {
    id: "phone-like",
    description: "Phone-like PII",
    pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    allow: (match, line) => {
      // Ignore ISO timestamps and pure numeric ids longer contexts
      if (/\d{4}-\d{2}-\d{2}T/.test(line)) return true;
      if (/fixture_/i.test(line)) return true;
      // Require separators typical of phone numbers (not bare 10-digit ids alone in JSON ids)
      if (!/[()+\-.\s]/.test(match)) return true;
      return false;
    }
  },
  {
    id: "oauth-client-secret",
    description: "OAuth client secret assignment",
    pattern:
      /\b(client_secret|clientSecret|PATREON_CLIENT_SECRET)\b\s*["']?\s*[:=]\s*['"][^'"]{6,}/gi
  }
];

function toPosixRel(from: string, file: string): string {
  return relative(from, file).split(sep).join("/");
}

function walkFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`fixture-scan: unable to read directory: ${dir}`);
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (st.isFile()) out.push(full);
  }
}

function isBinaryPath(file: string): boolean {
  return /\.(png|jpe?g|gif|webp|mp4|mp3|wav|pdf|zip|woff2?|ttf|ico)$/i.test(file);
}

/**
 * Scan a fixture root (must exist). Always walks the full tree — no silent skip.
 */
export function scanFixtureTree(fixtureRoot: string): FixtureScanResult {
  let st;
  try {
    st = statSync(fixtureRoot);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`fixture-scan: unable to open fixture root (${fixtureRoot}): ${detail}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`fixture-scan: fixture root is not a directory: ${fixtureRoot}`);
  }

  const files: string[] = [];
  walkFiles(fixtureRoot, files);
  if (files.length === 0) {
    throw new Error(`fixture-scan: fixture tree is empty: ${fixtureRoot}`);
  }

  const findings: FixtureScanFinding[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    if (isBinaryPath(file)) {
      // Fail closed on unexpected real media binaries under fixtures.
      findings.push({
        file: toPosixRel(fixtureRoot, file),
        ruleId: "binary-media-forbidden",
        detail: "Non-placeholder binary media is not allowed under fixtures/",
        line: 1
      });
      scannedFiles += 1;
      continue;
    }

    const text = readFileSync(file, "utf8");
    scannedFiles += 1;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rule.pattern.exec(line)) !== null) {
          const matched = m[0];
          if (rule.allow?.(matched, line)) continue;
          findings.push({
            file: toPosixRel(fixtureRoot, file),
            ruleId: rule.id,
            detail: `${rule.description}: ${matched.slice(0, 48)}`,
            line: i + 1
          });
        }
      }
    }
  }

  return { scannedFiles, findings };
}

export function formatFixtureScanFindings(result: FixtureScanResult): string {
  if (result.findings.length === 0) {
    return `fixture-scan: ok (${result.scannedFiles} files)`;
  }
  const lines = result.findings.map(
    (f) => `  [${f.ruleId}] ${f.file}:${f.line} — ${f.detail}`
  );
  return `fixture-scan: FAILED (${result.findings.length} finding(s) in ${result.scannedFiles} files)\n${lines.join("\n")}`;
}
