/**
 * PE-E (D22) — hand-rolled comment auto-mod.
 *
 * Deterministic ruleset. No external API. Each rule produces a `flag` row that the service
 * layer attaches to `Comment.autoModFlagsJson` for transparency, and aggregated severity
 * decides whether the comment goes live (`visible`) or starts in `hidden` for creator review.
 *
 * Adding rules: keep them pure (no I/O), give them a stable `ruleId`, and pick a severity
 * weight that reflects how confidently the rule should mute a comment by itself.
 */

export type AutoModSeverity = "info" | "warn" | "block";

export interface AutoModFlag {
  /** Stable rule identifier; safe to surface in moderator UI / logs. */
  rule_id: string;
  severity: AutoModSeverity;
  /** Short snippet (<= 80 chars) of the matching content for context. Never the full body. */
  snippet: string;
  /** Optional metadata: { matchCount, threshold, ... } — kept small & jsonifiable. */
  meta?: Record<string, string | number | boolean>;
}

export interface AutoModResult {
  flags: AutoModFlag[];
  /** What mod_state the comment should be created in. `visible` unless any flag has severity = "block". */
  initialModState: "visible" | "hidden";
}

const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;
/** Default block-list. Keep tiny + obvious; product owns the curated list per-creator long-term. */
const BANNED_TOKENS = ["http://spam", "porn-spam", "buy-now-cheap"];
const MAX_BODY_LEN = 4_000;
const MIN_BODY_LEN = 1;
const MAX_LINKS_BEFORE_FLAG = 2;
const REPEATED_CHAR_RUN = 8;
const ALL_CAPS_MIN_LENGTH = 20;
const ALL_CAPS_LETTER_RATIO = 0.7;

/** Run all rules over `body` and return the flags + recommended initial state. */
export function evaluateCommentAutoMod(body: string): AutoModResult {
  const flags: AutoModFlag[] = [];
  const trimmed = body.trim();

  if (trimmed.length < MIN_BODY_LEN) {
    flags.push({
      rule_id: "empty_body",
      severity: "block",
      snippet: ""
    });
  }

  if (trimmed.length > MAX_BODY_LEN) {
    flags.push({
      rule_id: "body_too_long",
      severity: "block",
      snippet: trimmed.slice(0, 80),
      meta: { length: trimmed.length, max: MAX_BODY_LEN }
    });
  }

  const links = trimmed.match(URL_REGEX) ?? [];
  if (links.length > MAX_LINKS_BEFORE_FLAG) {
    flags.push({
      rule_id: "many_links",
      severity: "warn",
      snippet: links.slice(0, 3).join(" "),
      meta: { count: links.length, threshold: MAX_LINKS_BEFORE_FLAG }
    });
  }

  const repeatRun = detectRepeatedCharRun(trimmed, REPEATED_CHAR_RUN);
  if (repeatRun) {
    flags.push({
      rule_id: "repeated_chars",
      severity: "warn",
      snippet: repeatRun.slice(0, 80),
      meta: { run: repeatRun.length }
    });
  }

  if (looksAllCaps(trimmed)) {
    flags.push({
      rule_id: "all_caps_shouting",
      severity: "info",
      snippet: trimmed.slice(0, 80)
    });
  }

  const lower = trimmed.toLowerCase();
  for (const token of BANNED_TOKENS) {
    if (lower.includes(token)) {
      flags.push({
        rule_id: "banned_token",
        severity: "block",
        snippet: token
      });
    }
  }

  const initialModState = flags.some((f) => f.severity === "block") ? "hidden" : "visible";
  return { flags, initialModState };
}

function detectRepeatedCharRun(s: string, minRun: number): string | null {
  let run = 1;
  let prev = "";
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === prev) {
      run += 1;
      if (run >= minRun) {
        return s.slice(start, i + 1);
      }
    } else {
      run = 1;
      prev = ch;
      start = i;
    }
  }
  return null;
}

function looksAllCaps(s: string): boolean {
  if (s.length < ALL_CAPS_MIN_LENGTH) return false;
  let letters = 0;
  let upper = 0;
  for (const ch of s) {
    if (/[a-zA-Z]/.test(ch)) {
      letters += 1;
      if (ch === ch.toUpperCase()) upper += 1;
    }
  }
  if (letters === 0) return false;
  return upper / letters >= ALL_CAPS_LETTER_RATIO;
}
