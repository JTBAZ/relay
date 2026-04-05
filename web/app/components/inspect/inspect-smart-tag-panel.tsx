"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Cpu,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Mock-only smart tagging / processing UI for single-asset inspect (no API). */

type TabId = "processing" | "suggestions" | "audit";

const PROCESSING_STEPS = [
  { id: "ingest", label: "File ingested", status: "done" as const },
  { id: "transcode", label: "Transcode to HLS", status: "done" as const },
  { id: "thumbnail", label: "Thumbnail extraction", status: "done" as const },
  { id: "embed", label: "Embedding generation", status: "processing" as const },
  { id: "scene", label: "Scene detection", status: "queued" as const }
];

type StepStatus = "done" | "processing" | "queued";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--lib-success)]" />;
  if (status === "processing")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--lib-success)]" />;
  return <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]" />;
}

function ProcessingTab() {
  return (
    <div className="flex flex-col gap-1 py-1">
      <p className="mb-2 text-xs leading-relaxed text-[var(--lib-fg-muted)]">
        Background jobs for this asset (mock — not connected to Relay).
      </p>
      {PROCESSING_STEPS.map((step, i) => (
        <div key={step.id} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <StepIcon status={step.status} />
            {i < PROCESSING_STEPS.length - 1 && (
              <div
                className={cn(
                  "my-0.5 min-h-[18px] w-px flex-1",
                  step.status === "done" ? "bg-[var(--lib-success)]/50" : "bg-[var(--lib-border)]"
                )}
              />
            )}
          </div>
          <div className="pb-3">
            <p
              className={cn(
                "text-sm leading-none",
                step.status === "queued" ? "text-[var(--lib-fg-muted)]" : "text-[var(--lib-fg)]"
              )}
            >
              {step.label}
            </p>
            {step.status === "processing" && (
              <p className="mt-0.5 text-[11px] text-[var(--lib-success)]">Running…</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const MOCK_CLUSTERS: { cluster: string; tags: string[] }[] = [
  { cluster: "Content type", tags: ["tutorial", "behind-the-scenes", "performance"] },
  { cluster: "Subject", tags: ["production", "mixing", "studio"] }
];

function SuggestionsTab() {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const toggle = (tagP: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(tagP)) next.delete(tagP);
      else next.add(tagP);
      return next;
    });

  return (
    <div className="flex flex-col gap-4 py-1">
      <p className="text-xs italic leading-relaxed text-[var(--lib-fg-muted)]">
        Mock suggested tags — no API.
      </p>
      {MOCK_CLUSTERS.map((c) => (
        <div key={c.cluster} className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3 text-[var(--lib-fg-muted)]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
              {c.cluster}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.tags
              .filter((t) => !dismissed.has(t))
              .map((tag) => {
                const on = accepted.has(tag);
                return (
                  <span
                    key={tag}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(tag)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(tag);
                      }
                    }}
                    className={cn(
                      "group inline-flex cursor-pointer select-none items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      on
                        ? "border-[var(--lib-selection)]/50 bg-[color-mix(in_srgb,var(--lib-selection)_14%,var(--lib-card))] text-[var(--lib-fg)]"
                        : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:border-[var(--lib-ring)]"
                    )}
                  >
                    {on ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : <Plus className="h-2.5 w-2.5 shrink-0" />}
                    {tag}
                    {!on && (
                      <button
                        type="button"
                        className="ml-0.5 rounded p-0.5 text-[var(--lib-fg-muted)] opacity-0 transition-opacity hover:text-[var(--lib-fg)] group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDismissed((prev) => new Set(prev).add(tag));
                        }}
                        aria-label={`Dismiss ${tag}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

const MOCK_AUDIT = [
  { id: "a1", actor: "system", action: "Ingested", at: "2025-03-12T09:14:22Z" },
  { id: "a2", actor: "creator", action: "Gallery visibility → Visible", at: "2025-03-14T08:30:00Z" }
];

function AuditTab() {
  return (
    <div className="flex flex-col gap-1 py-1">
      <p className="mb-2 text-xs italic text-[var(--lib-fg-muted)]">Mock audit trail.</p>
      <ol className="flex flex-col gap-3">
        {[...MOCK_AUDIT].reverse().map((evt) => (
          <li key={evt.id} className="border-l border-[var(--lib-border)] pl-3">
            <p className="text-sm text-[var(--lib-fg)]">{evt.action}</p>
            <p className="mt-0.5 text-[11px] text-[var(--lib-fg-muted)]">
              {evt.actor} · {new Date(evt.at).toLocaleString()}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function InspectSmartTagPanel() {
  const [active, setActive] = useState<TabId>("processing");
  const TABS: { id: TabId; label: string; Icon: typeof Cpu }[] = [
    { id: "processing", label: "Processing", Icon: Cpu },
    { id: "suggestions", label: "Suggestions", Icon: Sparkles },
    { id: "audit", label: "Audit", Icon: ClipboardList }
  ];

  return (
    <div className="flex flex-col border-t border-[var(--lib-border)] bg-[var(--lib-card)]">
      <div className="flex border-b border-[var(--lib-border)] px-3 pt-2">
        {TABS.map((tab) => {
          const Icon = tab.Icon;
          const is = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={cn(
                "mr-1 flex items-center gap-1 border-b-2 px-2 pb-2 text-xs transition-colors",
                is
                  ? "border-[var(--lib-selection)] font-medium text-[var(--lib-fg)]"
                  : "border-transparent text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", is ? "text-[var(--lib-success)]" : "")} />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="max-h-56 overflow-y-auto px-3 py-3">
        {active === "processing" && <ProcessingTab />}
        {active === "suggestions" && <SuggestionsTab />}
        {active === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
