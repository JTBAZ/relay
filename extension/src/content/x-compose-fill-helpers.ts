/** Collapse whitespace so Draft.js block nodes ("1" + "#test") match pasted newlines ("1\\n\\n#test"). */
export function normalizeComposeTextForMatch(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Full normalized equality — avoids treating duplicated hashtags as success (`1#f#f` vs `1#f`). */
export function composeFieldMatchesExpected(fieldText: string, expectedText: string): boolean {
  const normalizedExpected = normalizeComposeTextForMatch(expectedText);
  if (!normalizedExpected) {
    return !normalizeComposeTextForMatch(fieldText);
  }
  return normalizeComposeTextForMatch(fieldText) === normalizedExpected;
}

export function textTriggersHashtagTypeahead(text: string): boolean {
  return /#/.test(text);
}

const VERIFY_TIMEOUT_BASE_MS = 800;
const VERIFY_TIMEOUT_HASHTAG_MS = 3_500;

export function verifyTimeoutMsForText(text: string): number {
  return textTriggersHashtagTypeahead(text) ? VERIFY_TIMEOUT_HASHTAG_MS : VERIFY_TIMEOUT_BASE_MS;
}

const TYPEAHEAD_SETTLE_BASE_MS = 1_000;
const TYPEAHEAD_SETTLE_HASHTAG_MS = 5_000;

/** Max time to wait for X hashtag/cashtag typeahead to close after insert. */
export function typeaheadSettleTimeoutMs(text: string): number {
  return textTriggersHashtagTypeahead(text) ? TYPEAHEAD_SETTLE_HASHTAG_MS : TYPEAHEAD_SETTLE_BASE_MS;
}

export type SplitXPostText = {
  body: string;
  tagLine: string | null;
};

/** Matches Relay compile shape: `body` + blank line + space-separated `#hashtag` tokens. */
const SPLIT_TAG_LINE_RE = /^(?:#[A-Za-z0-9_]+\s*)+$/;

/**
 * Splits X post_text into body and trailing hashtag line for staged compose fill.
 * Plain tweets (no separate tag line) return the full string as `body`.
 */
export function splitXPostTextForFill(text: string): SplitXPostText {
  const trimmed = text.trim();
  if (!trimmed) {
    return { body: "", tagLine: null };
  }

  const match = trimmed.match(/^([\s\S]*?)\n\n((?:#[A-Za-z0-9_]+(?:\s+)*)+)$/);
  if (!match) {
    return { body: trimmed, tagLine: null };
  }

  const body = match[1].trim();
  const tagLine = match[2].trim();
  if (!SPLIT_TAG_LINE_RE.test(tagLine)) {
    return { body: trimmed, tagLine: null };
  }

  return { body, tagLine };
}
