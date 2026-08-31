export type CommandSelectionReviewSurface = "lab2" | "lab3" | "studio";

export type SelectionReviewFilterId = "all" | "selected" | "dropped" | "needs_review";

export type SelectionReviewDestination = "x" | "patreon" | "deviantart" | "bluesky";

export const SELECTION_REVIEW_DESTINATIONS = [
  "x",
  "patreon",
  "deviantart",
  "bluesky"
] as const satisfies readonly SelectionReviewDestination[];

export const SELECTION_REVIEW_FILTERS: Array<{ id: SelectionReviewFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "selected", label: "Selected" },
  { id: "dropped", label: "Dropped" },
  { id: "needs_review", label: "Needs review" }
];

type DestinationFlags = Partial<Record<SelectionReviewDestination, boolean>>;

export type SelectionReviewRecord = {
  post_id: string;
  title: string;
  member_label?: string | null;
  page_number?: number | null;
  destination_flags: DestinationFlags;
};

export function shouldOpenSelectionReview(input: {
  selectionUxEnabled: boolean;
  surface: CommandSelectionReviewSurface;
  postCount: number;
}): boolean {
  if (!input.selectionUxEnabled) return false;
  if (input.surface !== "lab3") return false;
  return input.postCount >= 2;
}

export function isFrozenSelectionStage(stage: string | null | undefined): boolean {
  return stage === "selection_approved" || stage === "plan_shaping";
}

/** Lab 3 selection workbench: hide Apply unless the frozen snapshot is collection Organize. */
export function shouldHideLibraryApply(input: {
  selectionUxEnabled: boolean;
  surface: CommandSelectionReviewSurface;
  selectionApproved?: boolean;
  writeLayer?: string | null;
}): boolean {
  if (!input.selectionUxEnabled || input.surface !== "lab3") return false;
  if (input.selectionApproved === true && input.writeLayer === "collection") return false;
  return true;
}

export function collectionMetaFromPreviewOps(
  ops: ReadonlyArray<{ capability?: string; payload?: Record<string, unknown>; target_ids?: string[] }>
): { collection_id: string | null; collection_title: string } {
  const row = ops.find((item) => item.capability === "create_or_update_collection");
  const payload = row?.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const fromPayload =
    typeof payload.collection_id === "string" && payload.collection_id.trim()
      ? payload.collection_id.trim()
      : "";
  const fromTarget = row?.target_ids?.[0]?.trim() ?? "";
  return {
    collection_id: fromPayload || fromTarget || null,
    collection_title: title
  };
}

export const ACTIVE_SELECTION_PROPOSAL_CONFLICT =
  "An active selection proposal already exists. Discard it first.";

export function isActiveSelectionProposalConflict(message: string | null | undefined): boolean {
  return Boolean(message && message.includes("An active selection proposal already exists"));
}

export function destinationPublicLabel(dest: string): string {
  if (dest === "x") return "X";
  if (dest === "patreon") return "Patreon";
  if (dest === "deviantart") return "DeviantArt";
  if (dest === "bluesky") return "Bluesky";
  return dest;
}

export function postedDestinationsForRecord(flags: DestinationFlags): SelectionReviewDestination[] {
  return SELECTION_REVIEW_DESTINATIONS.filter((key) => Boolean(flags[key]));
}

export function selectionScopeCopy(input: { total: number; selected: number }): string {
  return `${input.selected} of ${input.total} selected`;
}

export function dropPostedButtonLabel(count: number, dest: SelectionReviewDestination): string {
  return `Drop ${count} already on ${destinationPublicLabel(dest)}`;
}

export function reviewDuplicatesButtonLabel(count: number): string {
  return count === 1 ? "Review 1 duplicate" : `Review ${count} duplicates`;
}

export function reviewDuplicatesChipLabel(count: number): string {
  return count === 1 ? "1 duplicate" : `${count} duplicates`;
}

export function restoreDroppedButtonLabel(count: number): string {
  return count === 1 ? "Restore 1 dropped" : `Restore ${count} dropped`;
}

export function useSelectedButtonLabel(count: number): string {
  return `Use ${count} selected`;
}

export function tileFallbackMarker(record: {
  member_label?: string | null;
  page_number?: number | null;
  title: string;
}): string {
  const label = record.member_label?.trim();
  if (label) return label;
  if (record.page_number != null) return `Page ${record.page_number}`;
  return record.title.trim() || "Untitled";
}

export function includedPostedByDestination(
  records: readonly SelectionReviewRecord[],
  excluded: ReadonlySet<string>
): Array<{ dest: SelectionReviewDestination; post_ids: string[] }> {
  const out: Array<{ dest: SelectionReviewDestination; post_ids: string[] }> = [];
  for (const dest of SELECTION_REVIEW_DESTINATIONS) {
    const post_ids = records
      .filter((row) => !excluded.has(row.post_id) && Boolean(row.destination_flags[dest]))
      .map((row) => row.post_id);
    if (post_ids.length > 0) out.push({ dest, post_ids });
  }
  return out;
}

export type DuplicatePageGroup = {
  page_number: number;
  post_ids: string[];
};

export function duplicatePageGroups(records: readonly SelectionReviewRecord[]): DuplicatePageGroup[] {
  const byPage = new Map<number, string[]>();
  for (const row of records) {
    if (row.page_number == null) continue;
    const list = byPage.get(row.page_number) ?? [];
    list.push(row.post_id);
    byPage.set(row.page_number, list);
  }
  return [...byPage.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([page_number, post_ids]) => ({ page_number, post_ids }))
    .sort((a, b) => a.page_number - b.page_number);
}

export function duplicatePostIds(records: readonly SelectionReviewRecord[]): string[] {
  return duplicatePageGroups(records).flatMap((group) => group.post_ids);
}

export function filterVisiblePostIds(input: {
  postIds: readonly string[];
  excluded: ReadonlySet<string>;
  filter: SelectionReviewFilterId;
  needsReviewIds: ReadonlySet<string>;
}): string[] {
  return input.postIds.filter((id) => {
    const dropped = input.excluded.has(id);
    if (input.filter === "selected") return !dropped;
    if (input.filter === "dropped") return dropped;
    if (input.filter === "needs_review") return input.needsReviewIds.has(id);
    return true;
  });
}

export function selectionReviewChips(input: {
  count: number;
  excludedCount?: number;
  explanation: string;
  warnings: readonly string[];
}): string[] {
  const chips: string[] = [`${input.count} items`];
  if ((input.excludedCount ?? 0) > 0) {
    chips.push(`${input.excludedCount} excluded`);
  }
  const rule = input.explanation.trim();
  if (rule && rule !== "all") {
    for (const part of rule.split(/\s+AND\s+/)) {
      const bit = part.trim();
      if (bit) chips.push(bit);
    }
  }
  for (const warning of input.warnings) {
    const bit = warning.trim();
    if (bit) chips.push(bit);
  }
  return chips;
}

export function selectionReviewWarningNotes(warnings: readonly string[]): string[] {
  return warnings.map((row) => row.trim()).filter(Boolean);
}
