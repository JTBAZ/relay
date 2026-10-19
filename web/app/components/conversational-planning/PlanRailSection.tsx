"use client";

import type { PlanSnapshot } from "../../../../src/conversational-planning/contract.js";
import type { CapabilitiesView, PlanListView } from "./use-conversational-planning";

export type PlanRailSectionProps = {
  capabilities: CapabilitiesView;
  list: PlanListView;
  selectedCount: number;
  onNew: () => void;
  onOpen: (planId: string) => void;
  onLoadMore: () => void;
  onReload: () => void;
};

const reviewLabel = (review: PlanSnapshot["review"]) => review === "proposed" ? "Proposed" : review === "approved_for_preparation" ? "Approved for preparation" : "Cancelled";

export function PlanRailSection({ capabilities, list, selectedCount, onNew, onOpen, onLoadMore, onReload }: PlanRailSectionProps) {
  const enabled = capabilities.kind === "ready" && capabilities.value.enabled;
  const gated = capabilities.kind === "ready" && !capabilities.value.enabled;
  return <section aria-labelledby="planning-rail-title" className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3" data-testid="planning-rail">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="planning-rail-title" className="text-sm font-semibold text-white">Plans</h2><p className="mt-1 text-xs text-[#888]">{selectedCount} selected Library item{selectedCount === 1 ? "" : "s"}</p></div>
      <button type="button" onClick={onNew} disabled={!enabled || selectedCount === 0} className="rounded-md border border-[var(--lib-primary)]/40 px-2.5 py-1.5 text-xs font-medium text-[var(--lib-primary)] disabled:cursor-not-allowed disabled:opacity-50" title={selectedCount === 0 ? "Select Library items to start a plan" : !enabled ? "Planning is unavailable" : undefined} data-testid="planning-rail-new">Review selection</button>
    </div>
    {capabilities.kind === "loading" && <p className="mt-3 text-xs text-[#888]" role="status" data-testid="planning-capabilities-loading">Checking plan access…</p>}
    {capabilities.kind === "error" && <div className="mt-3" role="alert" data-testid="planning-capabilities-error"><p className="text-xs text-red-400">{capabilities.reason}</p><button type="button" onClick={onReload} className="mt-2 rounded-md border border-[#444] px-2 py-1 text-xs text-white">Retry</button></div>}
    {gated && <div className="mt-3" role="status" data-testid="planning-gated"><p className="text-xs text-[#aaa]">Plans are not enabled for this Studio.</p><button type="button" onClick={onReload} className="mt-2 rounded-md border border-[#444] px-2 py-1 text-xs text-white">Retry</button></div>}
    {enabled && list.kind === "loading" && <p className="mt-3 text-xs text-[#888]" role="status" data-testid="planning-list-loading">Loading saved plans…</p>}
    {enabled && list.kind === "error" && <div className="mt-3" role="alert" data-testid="planning-list-error"><p className="text-xs text-red-400">{list.reason}</p><button type="button" onClick={onReload} className="mt-2 rounded-md border border-[#444] px-2 py-1 text-xs text-white">Retry</button></div>}
    {enabled && list.kind === "ready" && list.items.length === 0 && <div className="mt-3 rounded-xl border border-dashed border-[#333] bg-[#0a0a0a] p-3" data-testid="planning-list-empty"><p className="text-xs font-medium text-white">No saved plans yet</p><p className="mt-1 text-[11px] text-[#888]">Plans appear here after a request has been saved.</p></div>}
    {enabled && list.kind === "ready" && list.items.length > 0 && <ul className="mt-3 space-y-1.5" aria-label="Saved plans" data-testid="planning-list">{list.items.map(plan => <li key={plan.plan_id}><button type="button" onClick={() => onOpen(plan.plan_id)} className="flex w-full items-start justify-between gap-2 rounded-lg border border-[var(--lib-border)] px-2.5 py-2 text-left hover:border-[var(--lib-primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-ring)]" data-testid={`planning-list-${plan.plan_id}`}><span className="min-w-0"><span className="block whitespace-pre-wrap break-words text-xs text-white">{plan.requested_text_quote}</span><span className="mt-1 block text-[10px] text-[#888]">{plan.steps.length} steps · revision {plan.revision}</span></span><span className="shrink-0 rounded-full border border-[var(--lib-border)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">{reviewLabel(plan.review)}</span></button></li>)}</ul>}
    {enabled && list.kind === "ready" && list.nextCursor && <div className="mt-2">{list.loadMoreError && <p className="mb-2 text-xs text-red-400" role="alert" data-testid="planning-load-more-error">{list.loadMoreError}</p>}<button type="button" onClick={onLoadMore} disabled={list.loadingMore} className="w-full rounded-md border border-[#444] px-2 py-1.5 text-xs text-white disabled:opacity-50" data-testid="planning-load-more">{list.loadingMore ? "Loading…" : "Load more"}</button></div>}
  </section>;
}
