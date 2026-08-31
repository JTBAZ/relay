"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Lab3Overlay } from "@/app/components/studio-lab3/Lab3Overlay";
import CommandStageComposer from "@/app/components/studio/command/CommandStageComposer";
import { GALLERY_THUMB_IMG_CLASS, galleryThumbLoadingProps } from "@/lib/gallery-thumb-loading";
import {
  destinationPublicLabel,
  dropPostedButtonLabel,
  duplicatePostIds,
  includedPostedByDestination,
  isFrozenSelectionStage,
  postedDestinationsForRecord,
  restoreDroppedButtonLabel,
  reviewDuplicatesChipLabel,
  selectionReviewWarningNotes,
  selectionScopeCopy,
  tileFallbackMarker,
  useSelectedButtonLabel
} from "@/lib/command-selection-review";
import type { CommandSelectionProposalClient, GalleryItem } from "@/lib/relay-api";

export const SELECTION_REVIEW_PAGE_SIZE = 12;

type Props = {
  open: boolean;
  proposal: CommandSelectionProposalClient | null;
  items: GalleryItem[];
  onClose: () => void;
  onExclude?: (postIds: string[]) => void;
  onRestore?: (postIds: string[]) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onApprove?: () => void;
  onRefine?: (instruction: string) => void;
  refineBusy?: boolean;
  refinementSummary?: string | null;
  onUndoRefinement?: () => void;
  patchBusy?: boolean;
  patchError?: string | null;
  restoreFocusRef?: { current: HTMLElement | null };
  pageSize?: number;
  onApply?: () => void;
};

function SelectionReviewTile({
  postId,
  title,
  posted,
  thumb,
  marker,
  excluded,
  frozen,
  onExclude,
  onRestore,
  patchBusy
}: {
  postId: string;
  title: string;
  posted: string[];
  thumb: string;
  marker: string;
  excluded: boolean;
  frozen: boolean;
  onExclude?: (postIds: string[]) => void;
  onRestore?: (postIds: string[]) => void;
  patchBusy: boolean;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showImg = Boolean(thumb) && !thumbFailed;
  const canToggle = !frozen && Boolean(excluded ? onRestore : onExclude);
  const label = excluded ? `Restore ${title}` : `Drop ${title}`;

  const toggle = () => {
    if (!canToggle || patchBusy) return;
    if (excluded) onRestore?.([postId]);
    else onExclude?.([postId]);
  };

  const visual = (
    <>
      <div className="relative aspect-square bg-[#111814]">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className={GALLERY_THUMB_IMG_CLASS}
            {...galleryThumbLoadingProps(false)}
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
            data-gallery-thumb-fallback=""
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--lab3-mint,#9bf0c4)]">
              {marker}
            </span>
            <span className="line-clamp-3 text-[11px] text-[var(--lab3-text,#d0ddd4)]">{title}</span>
          </div>
        )}
        {posted.length > 0 ? (
          <span
            className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-[#f3d27a]"
            data-selection-review-posted=""
          >
            Already on {posted.map(destinationPublicLabel).join(", ")}
          </span>
        ) : null}
        {excluded ? (
          <span
            className="absolute right-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-[#c5d0ca]"
            data-selection-review-dropped-badge=""
          >
            Dropped
          </span>
        ) : (
          <span
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lab3-mint,#9bf0c4)] text-[#08110c]"
            aria-hidden
            data-selection-review-check=""
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <p className="truncate px-1.5 py-1.5 text-[11px] text-[var(--lab3-text,#d0ddd4)]">{title}</p>
    </>
  );

  const frame = `group relative w-full overflow-hidden rounded-lg border bg-[#0a0f0b] text-left motion-reduce:transition-none motion-safe:transition-[transform,opacity,box-shadow] motion-safe:duration-150 ${
    excluded
      ? "scale-[0.96] border-[var(--lab3-hairline,#1c211f)] opacity-50 motion-reduce:scale-100"
      : "border-[var(--lab3-mint,#9bf0c4)] shadow-[inset_0_0_0_1px_rgba(155,240,196,0.35)]"
  }`;

  return (
    <li className="min-w-0">
      {canToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={!excluded}
          aria-label={label}
          disabled={patchBusy}
          onClick={toggle}
          className={`${frame} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c0a]`}
          data-selection-review-tile={postId}
          data-selection-review-excluded={excluded ? "" : undefined}
          data-selection-review-included={excluded ? undefined : ""}
        >
          {visual}
        </button>
      ) : (
        <article
          className={frame}
          data-selection-review-tile={postId}
          data-selection-review-excluded={excluded ? "" : undefined}
          data-selection-review-included={excluded ? undefined : ""}
        >
          {visual}
        </article>
      )}
    </li>
  );
}

export default function SelectionReviewOverlay({
  open,
  proposal,
  items,
  onClose,
  onExclude,
  onRestore,
  onSelectAll,
  onSelectNone,
  onApprove,
  onRefine,
  refineBusy = false,
  refinementSummary = null,
  onUndoRefinement,
  patchBusy = false,
  patchError = null,
  restoreFocusRef,
  pageSize = SELECTION_REVIEW_PAGE_SIZE,
  onApply
}: Props) {
  const [page, setPage] = useState(0);
  const [refineText, setRefineText] = useState("");

  useEffect(() => {
    setPage(0);
    setRefineText("");
  }, [proposal?.proposal_id]);

  useEffect(() => {
    if (refinementSummary) setRefineText("");
  }, [refinementSummary]);

  const thumbByPost = useMemo(() => {
    const map = new Map<string, GalleryItem>();
    for (const item of items) {
      if (!map.has(item.post_id)) map.set(item.post_id, item);
    }
    return map;
  }, [items]);

  const ids = proposal?.snapshot.post_ids ?? [];
  const excluded = new Set(proposal?.exclude_post_ids ?? []);
  const pendingCount = proposal ? ids.filter((id) => !excluded.has(id)).length : 0;
  const frozen = isFrozenSelectionStage(proposal?.stage);
  const records = proposal?.records ?? [];
  const duplicateIds = useMemo(() => new Set(duplicatePostIds(records)), [records]);
  const postedBuckets = includedPostedByDestination(records, excluded);
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(ids.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageIds = ids.slice(safePage * size, safePage * size + size);
  const warnings = proposal ? selectionReviewWarningNotes(proposal.snapshot.warnings) : [];
  const canMutate = Boolean(proposal && !frozen && (onExclude || onApprove));
  const droppedCount = proposal?.exclude_post_ids.length ?? 0;
  const busy = patchBusy || refineBusy;

  const submitRefine = () => {
    const text = refineText.trim();
    if (!text || !onRefine || busy || frozen) return;
    onRefine(text);
  };

  return (
    <Lab3Overlay
      open={open && Boolean(proposal)}
      title={frozen ? "Selection approved" : "Review selection"}
      onClose={onClose}
      variant="center"
      size="lg"
      testId="selection"
      restoreFocusRef={restoreFocusRef}
    >
      {proposal ? (
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div
            className="sticky top-0 z-[2] space-y-2 border-b border-[var(--lab3-hairline,#1c211f)] bg-[var(--lab3-surface,#080c0a)] px-4 py-2.5"
            data-selection-review-composer=""
          >
            {canMutate && onRefine ? (
              <CommandStageComposer
                id="selection-review-refine"
                label="Refine selection"
                placeholder="Remove anything already on X."
                value={refineText}
                onChange={setRefineText}
                onSubmit={submitRefine}
                disabled={busy}
                submitLabel="Preview refinement"
              />
            ) : null}
            {refinementSummary ? (
              <p
                className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--lab3-mint,#9bf0c4)]"
                data-selection-review-refine-summary=""
              >
                <span>{refinementSummary}</span>
                {canMutate && onUndoRefinement ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onUndoRefinement}
                    className="h-6 rounded border border-[var(--lab3-hairline,#1c211f)] px-2 text-[11px] text-[var(--lab3-text,#d0ddd4)]"
                  >
                    Undo
                  </button>
                ) : null}
              </p>
            ) : null}
            <div
              className="flex flex-wrap items-center gap-1.5"
              data-selection-review-chips=""
              aria-label="Selection notes"
            >
              <span
                className="inline-flex h-6 items-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0e1410] px-2.5 text-[11px] text-[var(--lab3-text-strong,#e8e8e8)]"
                data-selection-review-scope=""
              >
                {frozen
                  ? `${proposal.frozen_post_ids.length} frozen`
                  : selectionScopeCopy({ total: ids.length, selected: pendingCount })}
              </span>
              {warnings.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex h-6 items-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0e1410] px-2.5 text-[11px] text-[var(--lab3-text,#d0ddd4)]"
                >
                  {chip}
                </span>
              ))}
              {duplicateIds.size >= 2 ? (
                <span
                  className="inline-flex h-6 items-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0e1410] px-2.5 text-[11px] text-[var(--lab3-text-muted,#6a736e)]"
                  data-selection-review-duplicates=""
                >
                  {reviewDuplicatesChipLabel(duplicateIds.size)}
                </span>
              ) : null}
              {canMutate
                ? postedBuckets.map((bucket) => (
                    <button
                      key={bucket.dest}
                      type="button"
                      disabled={busy || !onExclude}
                      onClick={() => onExclude?.(bucket.post_ids)}
                      className="inline-flex h-6 items-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0e1410] px-2.5 text-[11px] text-[var(--lab3-text,#d0ddd4)] disabled:opacity-40"
                    >
                      {dropPostedButtonLabel(bucket.post_ids.length, bucket.dest)}
                    </button>
                  ))
                : null}
              {canMutate && droppedCount > 0 ? (
                <button
                  type="button"
                  disabled={busy || !onSelectAll}
                  onClick={() => onSelectAll?.()}
                  className="inline-flex h-6 items-center rounded-full border border-[var(--lab3-hairline,#1c211f)] bg-[#0e1410] px-2.5 text-[11px] text-[var(--lab3-text,#d0ddd4)] disabled:opacity-40"
                >
                  {restoreDroppedButtonLabel(droppedCount)}
                </button>
              ) : null}
            </div>
            {patchError ? (
              <p className="text-[11px] text-red-300" role="alert">
                {patchError}
              </p>
            ) : null}
            {frozen ? (
              <p className="text-[11px] text-[var(--lab3-mint,#9bf0c4)]" data-selection-review-frozen-note="">
                {onApply
                  ? "Gallery is unchanged until you apply."
                  : "Apply to library is not available yet."}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {pageIds.length === 0 ? (
              <p className="text-[12px] text-[var(--lab3-text-muted,#6a736e)]">Nothing in this selection.</p>
            ) : (
              <ul
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 motion-reduce:transition-none"
                data-selection-review-grid=""
                data-selection-review-page={String(safePage)}
              >
                {pageIds.map((postId) => {
                  const record = proposal.records.find((r) => r.post_id === postId);
                  const gallery = thumbByPost.get(postId);
                  const title = record?.title ?? postId;
                  return (
                    <SelectionReviewTile
                      key={postId}
                      postId={postId}
                      title={title}
                      posted={record ? postedDestinationsForRecord(record.destination_flags) : []}
                      thumb={gallery?.thumb_url_path?.trim() || ""}
                      marker={tileFallbackMarker({
                        member_label: record?.member_label,
                        page_number: record?.page_number,
                        title
                      })}
                      excluded={excluded.has(postId)}
                      frozen={frozen}
                      onExclude={onExclude}
                      onRestore={onRestore}
                      patchBusy={busy}
                    />
                  );
                })}
              </ul>
            )}
          </div>

          {canMutate || pageCount > 1 || (frozen && onApply) ? (
            <div
              className="sticky bottom-0 z-[2] flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lab3-hairline,#1c211f)] bg-[var(--lab3-surface,#080c0a)] px-4 py-3"
              data-selection-review-actions=""
            >
              <div className="flex flex-wrap gap-1.5">
                {canMutate ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-md border border-[var(--lab3-hairline,#1c211f)] px-3 text-[12px] text-[var(--lab3-text,#d0ddd4)]"
                  >
                    Cancel
                  </button>
                ) : null}
                {frozen && onApply ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-md border border-[var(--lab3-hairline,#1c211f)] px-3 text-[12px] text-[var(--lab3-text,#d0ddd4)]"
                  >
                    Close
                  </button>
                ) : null}
                {canMutate && onSelectNone ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelectNone()}
                    className="h-8 shrink-0 rounded-md px-2 text-[11px] text-[var(--lab3-text-muted,#6a736e)] disabled:opacity-40"
                  >
                    Select none
                  </button>
                ) : null}
              </div>
              {pageCount > 1 ? (
                <div className="flex items-center gap-2" data-selection-review-pager="">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Back to previous page"
                    className="h-8 rounded-md border border-[var(--lab3-hairline,#1c211f)] px-3 text-[12px] text-[var(--lab3-text,#d0ddd4)] disabled:opacity-40"
                  >
                    Back
                  </button>
                  <p className="text-[11px] text-[var(--lab3-text-muted,#6a736e)]">
                    {safePage + 1} of {pageCount}
                  </p>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="h-8 rounded-md border border-[var(--lab3-hairline,#1c211f)] px-3 text-[12px] text-[var(--lab3-text,#d0ddd4)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
              {canMutate ? (
                <button
                  type="button"
                  disabled={busy || pendingCount === 0 || !onApprove}
                  onClick={() => onApprove?.()}
                  className="h-8 rounded-md border border-[var(--lab3-mint,#9bf0c4)]/50 bg-[#122018] px-3 text-[12px] font-medium text-[var(--lab3-mint,#9bf0c4)] disabled:opacity-40"
                >
                  {useSelectedButtonLabel(pendingCount)}
                </button>
              ) : null}
              {frozen && onApply ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApply()}
                  data-selection-review-apply=""
                  className="h-8 rounded-md border border-[var(--lab3-mint,#9bf0c4)]/50 bg-[#122018] px-3 text-[12px] font-medium text-[var(--lab3-mint,#9bf0c4)] disabled:opacity-40"
                >
                  Apply
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Lab3Overlay>
  );
}
