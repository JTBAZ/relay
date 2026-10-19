"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { CopyValue, PlanSnapshot, PlanStep } from "../../../../src/conversational-planning/contract.js";
import type { PlanningPreviewOk, PlanningReadOk } from "@/lib/conversational-planning-api";
import type { PlanView } from "./use-conversational-planning";

export type PlanReviewPanelProps = {
  view: PlanView;
  onClose: () => void;
  onReload: () => void;
};

const copyText = (copy: CopyValue) =>
  copy.mode === "literal" ? copy.value : `${copy.prefix}${copy.part}${copy.suffix}`;

const copyOrigin = (copy: CopyValue) =>
  copy.mode === "literal"
    ? `Literal copy · ${copy.origin} supplied`
    : `Part substitution · part from ${copy.part_source}`;

const titleOf = (step: PlanStep) => copyText(step.title);
const capabilityName = (value: string) => value.replaceAll("_", " ");
const issueName = (value: string) => value.replaceAll("_", " ");

function Time({ step }: { step: PlanStep }) {
  if (!step.time) {
    return <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">No time specified</p>;
  }

  if (step.time.kind === "absolute") {
    return (
      <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
        {step.time.local.replace("T", " ")} {step.time.timezone} · UTC {step.time.at_utc}
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
      Day +{step.time.day_offset} after publication of step {step.time.anchor_step_id} ·{" "}
      {step.time.local_time} {step.time.timezone}
    </p>
  );
}

function StepCard({ step, steps }: { step: PlanStep; steps: readonly PlanStep[] }) {
  const dependencies = step.depends_on
    .map((id) => steps.find((item) => item.step_id === id))
    .filter((item): item is PlanStep => Boolean(item));

  return (
    <article
      className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3"
      data-testid={`planning-step-${step.step_id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">
          {capabilityName(step.capability)}
        </span>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
            step.enabled
              ? "border-emerald-900 text-emerald-300"
              : "border-[var(--lib-border)] text-[var(--lib-fg-muted)]"
          }`}
        >
          {step.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <h4 className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-white">
        {titleOf(step)}
      </h4>
      <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-[var(--lib-fg-muted)]">
        {copyOrigin(step.title)}
      </p>

      {"copy_title" in step && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Destination copy
          </p>
          <p className="whitespace-pre-wrap break-words text-xs text-[var(--lib-fg-muted)]">
            {copyText(step.copy_title)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">
            {copyOrigin(step.copy_title)}
          </p>
        </div>
      )}

      {step.note !== null && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">Note</p>
          <p className="whitespace-pre-wrap break-words text-xs text-[var(--lib-fg-muted)]">
            {step.note}
          </p>
        </div>
      )}

      {step.capability === "prepare_post_draft" && (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          Patreon source draft · target post: {step.target_post_id ?? "none"} · media:{" "}
          {step.source_media_ids.join(", ") || "none"}
        </p>
      )}
      {step.capability === "prepare_preview" && (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          Saved template: {step.template_id} · source step: {step.source_step_id}
        </p>
      )}
      {step.capability === "prepare_distribution" && (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          Destination: {step.destination} · group: {step.distribution_group_id} · source:{" "}
          {step.source_step_id}
          {step.preview_step_id ? ` · preview: ${step.preview_step_id}` : ""}
        </p>
      )}
      {step.capability === "publish_handoff" && (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          Creator controlled handoff · {step.destination} · distribution step:{" "}
          {step.distribution_step_id}
        </p>
      )}
      {(step.capability === "reply_block" || step.capability === "engagement_check") && (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          {step.capability === "reply_block" ? "Reply block" : "Engagement check"} ·{" "}
          {step.destination} · after publication step {step.publication_step_id} · target post:{" "}
          {step.target_post_id ?? "unresolved"}
        </p>
      )}

      <Time step={step} />
      <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
        Depends on: {dependencies.length ? dependencies.map(titleOf).join("; ") : "nothing"}
      </p>
      <details className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
        <summary className="cursor-pointer">Step identity</summary>
        <p className="mt-1 break-all">{step.step_id}</p>
        {step.depends_on.length > 0 && (
          <p className="break-all">Dependency IDs: {step.depends_on.join(", ")}</p>
        )}
      </details>
    </article>
  );
}

function SourceSummary({ plan }: { plan: PlanSnapshot }) {
  return (
    <section className="rounded-xl border border-[var(--lib-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        Source
      </h3>
      <p className="mt-2 text-xs text-white">
        {plan.source.kind === "existing_post" ? "Existing post" : "Staged Library media"}
        {plan.source.post_id ? " · existing Relay post" : ""} ·{" "}
        {plan.source.selected_media_ids.length} selected media item
        {plan.source.selected_media_ids.length === 1 ? "" : "s"}
      </p>
      <details className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
        <summary className="cursor-pointer">Source identifiers and revision</summary>
        <p className="mt-1 break-words">
          Post: {plan.source.post_id ?? "none"} · media:{" "}
          {plan.source.selected_media_ids.join(", ") || "none"}
        </p>
        <p className="mt-1 break-words">
          Creative work: {plan.source.creative_work_id ?? "none"} · series member:{" "}
          {plan.source.creative_series_member_id ?? "none"}
        </p>
        <p className="mt-1 break-all">Source revision: {plan.source.source_revision}</p>
      </details>
    </section>
  );
}

function DistributionGroups({ plan }: { plan: PlanSnapshot }) {
  return (
    <section className="rounded-xl border border-[var(--lib-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        Distribution groups
      </h3>
      {plan.distribution_groups.length ? (
        <ul className="mt-2 space-y-2">
          {plan.distribution_groups.map((group) => (
            <li
              key={group.group_id}
              className="text-xs text-[var(--lib-fg-muted)]"
              data-testid={`planning-group-${group.group_id}`}
            >
              <p>Group {group.group_id}</p>
              <p className="mt-1">
                Source step {group.source_step_id} · preview step {group.preview_step_id ?? "none"}
              </p>
              <p className="mt-1 break-words">
                Destination steps: {group.destination_step_ids.join(", ") || "none"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">No distribution groups.</p>
      )}
    </section>
  );
}

function Clarifications({ plan }: { plan: PlanSnapshot }) {
  return (
    <section className="rounded-xl border border-[var(--lib-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        Clarifications
      </h3>
      {plan.clarifications.length ? (
        <ul className="mt-2 space-y-2">
          {plan.clarifications.map((item) => (
            <li
              key={item.slot_id}
              className="rounded-lg bg-[var(--lib-card)] p-2 text-xs"
              data-testid={`planning-clarification-${item.slot_id}`}
            >
              <p className="text-white">{item.question}</p>
              <p className="mt-1 text-[var(--lib-fg-muted)]">
                {item.field} · {issueName(item.reason)} · blocking
              </p>
              <p className="mt-1 break-words text-[var(--lib-fg-muted)]">
                Affected steps: {item.affected_node_ids.join(", ") || "none specified"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">No clarification questions.</p>
      )}
    </section>
  );
}

function UnresolvedRequests({ plan }: { plan: PlanSnapshot }) {
  return (
    <section className="rounded-xl border border-[var(--lib-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        Unresolved requests
      </h3>
      {plan.unresolved_requests.length ? (
        <ul className="mt-2 space-y-2">
          {plan.unresolved_requests.map((item) => (
            <li
              key={item.request_id}
              className="text-xs text-[var(--lib-fg-muted)]"
              data-testid={`planning-unresolved-${item.request_id}`}
            >
              <p className="whitespace-pre-wrap break-words text-white">
                {item.requested_text_quote}
              </p>
              <p className="mt-1">
                {item.intended_capability ?? "Unspecified action"} ·{" "}
                {item.intended_destination ?? "Unspecified destination"}
              </p>
              <p className="mt-1 break-words">
                Blocking slots: {item.blocking_slot_ids.join(", ") || "none specified"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">No unresolved request quotes.</p>
      )}
    </section>
  );
}

function Readiness({
  preview,
  pointers
}: {
  preview: PlanningPreviewOk;
  pointers: PlanningReadOk["pointers"];
}) {
  return (
    <section className="rounded-xl border border-[var(--lib-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
        Current review readiness
      </h3>
      <p className="mt-2 text-xs text-white">{preview.readiness.status}</p>
      {preview.readiness.issues.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-amber-200">
          {preview.readiness.issues.map((issue) => (
            <li key={issue}>{issueName(issue)}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
        {preview.readiness.pointerCount} checked pointers
      </p>
      <details className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
        <summary className="cursor-pointer">Checked authority pointers</summary>
        <ul className="mt-1 space-y-1">
          {pointers.length ? (
            pointers.map((pointer, index) => (
              <li
                key={`${pointer.node_id}-${pointer.slot}-${pointer.authority_id}-${index}`}
                className="break-words"
              >
                {pointer.slot} · {pointer.kind} · node {pointer.node_id} · authority{" "}
                {pointer.authority_id}
              </li>
            ))
          ) : (
            <li>No linked authority pointers.</li>
          )}
        </ul>
      </details>
      <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
        Linked identifiers show an existing authority pointer only. They do not claim preparation,
        delivery, publication or completion here.
      </p>
    </section>
  );
}

function Summary({
  plan,
  pointers,
  preview
}: {
  plan: PlanSnapshot;
  pointers: PlanningReadOk["pointers"];
  preview: PlanningPreviewOk;
}) {
  return (
    <>
      <section className="rounded-xl border border-[var(--lib-border)] p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
          Request and review
        </h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white">
          {plan.requested_text_quote}
        </p>
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          {plan.review.replaceAll("_", " ")} · revision {plan.revision} · plan {plan.plan_id}
        </p>
        <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">Updated {plan.updated_at}</p>
      </section>

      <SourceSummary plan={plan} />

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
          Complete composition · {plan.steps.length} steps
        </h3>
        <div className="space-y-2">
          {plan.steps.map((step) => (
            <StepCard key={step.step_id} step={step} steps={plan.steps} />
          ))}
        </div>
      </section>

      <DistributionGroups plan={plan} />
      <Clarifications plan={plan} />
      <UnresolvedRequests plan={plan} />
      <Readiness preview={preview} pointers={pointers} />
    </>
  );
}

function NewSelection({
  selection
}: {
  selection: Extract<PlanView, { kind: "new" }>["selection"];
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-[var(--lib-border)] bg-[var(--lib-card)] p-4"
      data-testid="planning-new-selection"
    >
      <h3 className="text-sm font-medium text-white">Selection ready for a plan request</h3>
      <p className="mt-2 text-xs leading-5 text-[var(--lib-fg-muted)]">
        This view shows the Library items selected for a future planning request. No plan has been
        created or saved. Requesting work and making changes are not available in this read-only
        review.
      </p>
      <p className="mt-3 break-words text-xs text-[var(--lib-fg-muted)]">
        Posts: {selection.selectedPostIds.join(", ") || "none"}
      </p>
      <p className="mt-1 break-words text-xs text-[var(--lib-fg-muted)]">
        Media: {selection.selectedMediaIds.join(", ") || "none"}
      </p>
    </div>
  );
}

function DetailError({
  reason,
  onReload
}: {
  reason: Extract<PlanView, { kind: "read_error" }>["reason"];
  onReload: () => void;
}) {
  const message = {
    stale_source: "The saved plan’s source has changed.",
    forbidden: "This session cannot read that plan.",
    unavailable: "Plan review is unavailable on this environment.",
    revision_mismatch: "The plan changed while its review was loading.",
    other: "The plan could not be loaded."
  }[reason];

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-900/70 p-4"
      data-testid="planning-detail-error"
    >
      <p className="text-sm text-red-300">{message}</p>
      <button
        type="button"
        onClick={onReload}
        className="mt-3 rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]"
        data-testid="planning-detail-reload"
      >
        Reload plan
      </button>
    </div>
  );
}

export function PlanReviewPanel({ view, onClose, onReload }: PlanReviewPanelProps) {
  const open = view.kind !== "closed";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70" />
        <Dialog.Content
          className="library-shell fixed inset-y-0 right-0 z-[101] flex w-full max-w-2xl flex-col border-l border-[var(--lib-border)] bg-[var(--lib-bg)] text-white outline-none sm:inset-y-6 sm:right-6 sm:rounded-2xl sm:border"
          aria-describedby="planning-dialog-description"
          data-testid="planning-review-panel"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--lib-border)] p-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">Plan review</Dialog.Title>
              <Dialog.Description
                id="planning-dialog-description"
                className="mt-1 text-xs text-[var(--lib-fg-muted)]"
              >
                Read-only view of a saved plan or the current Library selection.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close plan review"
                className="rounded-md border border-[var(--lib-border)] px-2.5 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]"
                data-testid="planning-review-close"
              >
                Close
              </button>
            </Dialog.Close>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            data-testid="planning-review-scroll"
          >
            {view.kind === "new" && <NewSelection selection={view.selection} />}
            {view.kind === "loading" && (
              <p
                role="status"
                className="rounded-xl border border-[var(--lib-border)] p-4 text-sm text-[var(--lib-fg-muted)]"
                data-testid="planning-detail-loading"
              >
                Loading the selected plan…
              </p>
            )}
            {view.kind === "read_error" && (
              <DetailError reason={view.reason} onReload={onReload} />
            )}
            {view.kind === "detail" && (
              <div className="space-y-3">
                <Summary
                  plan={view.read.current}
                  pointers={view.read.pointers}
                  preview={view.preview}
                />
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[var(--lib-border)] px-4 py-3 text-[11px] text-[var(--lib-fg-muted)]">
            Reading a plan does not create or change it.
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
