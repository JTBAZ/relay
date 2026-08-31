/**
 * Numbered sequence extraction for `resolve_numbered_sequence` (P1).
 * Page / Part / Pg / P variants, zero-padding, cover detection. Reports gaps
 * and duplicates without inventing pages.
 *
 * @see docs/studio/relay-command-mcp-build-plans/01-PHASE-1-CONTENT-FOUNDATION.md RC-P1-T04
 */

import {
  COMMAND_SEQUENCE_TOKEN_KINDS,
  CommandContractError,
  type CommandSequenceMember,
  type CommandSequenceTokenKind
} from "./contracts.js";

const TOKEN_RE = /\b(page|part|pg\.?|p\.?)\s*0*(\d+)\b/i;
const COVER_RE = /\bcover\b/i;
const UNPARSED_SORT_KEY = Number.MAX_SAFE_INTEGER;

export type CommandSequenceInput = {
  post_id: string;
  title: string;
  member_label?: string | null;
};

export type CommandSequenceResolution = {
  members: CommandSequenceMember[];
  gaps: number[];
  duplicates: number[];
  unparsed_post_ids: string[];
  series_label: string | null;
  candidate_series_labels: string[];
};

export type ParsedSequenceToken = {
  token_kind: CommandSequenceTokenKind | null;
  number: number | null;
  is_cover: boolean;
  series_label: string | null;
};

function normalizeSeriesLabel(raw: string): string {
  return raw
    .replace(/[-–—:,|/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function kindFromMatch(raw: string): CommandSequenceTokenKind {
  const k = raw.toLowerCase().replace(/\./g, "");
  if (k === "page") return "page";
  if (k === "part") return "part";
  if (k === "pg") return "pg";
  return "p";
}

export function parseSequenceToken(text: string): ParsedSequenceToken {
  const trimmed = text.trim();
  if (!trimmed) {
    return { token_kind: null, number: null, is_cover: false, series_label: null };
  }
  const cover = COVER_RE.test(trimmed);
  const match = trimmed.match(TOKEN_RE);
  if (!match || match.index === undefined) {
    const label = cover ? normalizeSeriesLabel(trimmed.replace(COVER_RE, " ")) : null;
    return {
      token_kind: null,
      number: null,
      is_cover: cover,
      series_label: label && label.length > 0 ? label : null
    };
  }
  const before = normalizeSeriesLabel(trimmed.slice(0, match.index));
  return {
    token_kind: kindFromMatch(match[1]!),
    number: Number(match[2]),
    is_cover: false,
    series_label: before.length > 0 ? before : null
  };
}

function parseFromInput(item: CommandSequenceInput): ParsedSequenceToken {
  if (item.member_label && item.member_label.trim()) {
    const fromLabel = parseSequenceToken(item.member_label);
    if (fromLabel.number !== null || fromLabel.is_cover) return fromLabel;
  }
  return parseSequenceToken(item.title);
}

function sortKeyFor(parsed: ParsedSequenceToken): number {
  if (parsed.is_cover) return 0;
  if (parsed.number !== null) return parsed.number;
  return UNPARSED_SORT_KEY;
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * Parse, sort numerically, and report gaps/duplicates. Mixed series labels
 * fail closed with COMMAND_AMBIGUOUS (does not pick).
 */
export function resolveNumberedSequence(
  items: readonly CommandSequenceInput[]
): CommandSequenceResolution {
  const parsedRows = items.map((item) => {
    const parsed = parseFromInput(item);
    const member: CommandSequenceMember = {
      post_id: item.post_id,
      title: item.title,
      member_label: item.member_label ?? null,
      token_kind: parsed.token_kind,
      number: parsed.number,
      sort_key: sortKeyFor(parsed),
      is_cover: parsed.is_cover
    };
    return { member, series_label: parsed.series_label };
  });

  const seriesSeen = new Map<string, string>();
  for (const row of parsedRows) {
    if (!row.series_label) continue;
    const key = row.series_label.toLowerCase();
    if (!seriesSeen.has(key)) seriesSeen.set(key, row.series_label);
  }
  const candidate_series_labels = [...seriesSeen.values()].sort((a, b) =>
    a.localeCompare(b)
  );
  if (candidate_series_labels.length > 1) {
    throw new CommandContractError(
      "COMMAND_AMBIGUOUS",
      "Multiple series labels matched; ask which series to use.",
      candidate_series_labels.map((label) => ({ field: "series", issue: label }))
    );
  }

  const members = parsedRows
    .map((row) => row.member)
    .sort((a, b) => {
      if (a.sort_key !== b.sort_key) return a.sort_key - b.sort_key;
      return a.post_id.localeCompare(b.post_id);
    });

  const numbers = members
    .map((m) => m.number)
    .filter((n): n is number => n !== null);
  const counts = new Map<number, number>();
  for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
  const duplicates = uniqueSorted([...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n));

  const gaps: number[] = [];
  if (numbers.length > 0) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const have = new Set(numbers);
    for (let n = min; n <= max; n += 1) {
      if (!have.has(n)) gaps.push(n);
    }
  }

  return {
    members,
    gaps,
    duplicates,
    unparsed_post_ids: members
      .filter((m) => m.number === null && !m.is_cover)
      .map((m) => m.post_id),
    series_label: candidate_series_labels[0] ?? null,
    candidate_series_labels
  };
}

/** Throws COMMAND_SEQUENCE_GAP / COMMAND_SEQUENCE_DUPLICATE when mechanics fail. */
export function assertNumberedSequence(resolution: CommandSequenceResolution): void {
  if (resolution.gaps.length > 0) {
    throw new CommandContractError(
      "COMMAND_SEQUENCE_GAP",
      "Numbered sequence is missing page numbers.",
      resolution.gaps.map((n) => ({ field: "number", issue: String(n) }))
    );
  }
  if (resolution.duplicates.length > 0) {
    throw new CommandContractError(
      "COMMAND_SEQUENCE_DUPLICATE",
      "Numbered sequence has duplicate page numbers.",
      resolution.duplicates.map((n) => ({ field: "number", issue: String(n) }))
    );
  }
}

export function sequenceTokenKinds(): readonly CommandSequenceTokenKind[] {
  return COMMAND_SEQUENCE_TOKEN_KINDS;
}
