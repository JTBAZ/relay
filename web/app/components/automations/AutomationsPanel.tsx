"use client";

/**
 * Automations overview — list, create forms, history, lifecycle (VS7 / B18).
 * Approval opens via host callback (same AutomationApprovalOverlay adapter).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveAutomation,
  createAutomation,
  listAutomationRuns,
  listAutomations,
  patchAutomation,
  type AutomationConnectorWire,
  type AutomationDestination,
  type AutomationPresetKind,
  type AutomationRunHistoryWire,
  type CreateAutomationBody
} from "@/lib/automation-api";
import {
  RelayApiError,
  fetchConnectedPlatforms,
  fetchPreviewTemplates,
  type PreviewTemplateWire
} from "@/lib/relay-api";
import { DEST_LABELS } from "@/lib/schedule-rail-data";

export type AutomationApprovalOpenArgs = {
  automationId: string;
  runId: string;
  draftId?: string | null;
};

type View =
  | { kind: "overview" }
  | { kind: "create"; preset: AutomationPresetKind }
  | { kind: "history"; automation: AutomationConnectorWire };

const SOCIAL_DESTS: AutomationDestination[] = ["x", "deviantart", "bluesky"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function newMutationKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `auto_mut_${crypto.randomUUID()}`;
  }
  return `auto_mut_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function presetLabel(kind: AutomationPresetKind): string {
  return kind === "preview_crosspost" ? "Preview & crosspost" : "Delayed public release";
}

function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "archived") return "Archived";
  return status;
}

function runStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "ready" || s === "awaiting_review" || s === "materialized") return "Ready for review";
  if (s === "skipped" || s === "no_new_post") return "Skipped — no new post";
  if (s === "expired") return "Expired";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  if (s === "failed") return "Failed";
  if (s === "completed") return "Completed";
  return status;
}

function isReadyRun(status: string): boolean {
  const s = status.toLowerCase();
  return s === "ready" || s === "awaiting_review" || s === "materialized";
}

function triggerSummary(row: AutomationConnectorWire): string {
  if (row.preset_kind === "delayed_public_release") {
    const days = row.offset_days ?? 30;
    return `${days} day${days === 1 ? "" : "s"} after Patreon publishes`;
  }
  const sch = row.schedule;
  if (!sch) return "Scheduled";
  const time = sch.local_time || "09:00";
  if (sch.cadence === "weekly") {
    const days = (sch.weekdays ?? [])
      .map((d) => WEEKDAY_LABELS[d] ?? String(d))
      .join(", ");
    return `Weekly ${days || "—"} at ${time} (${sch.timezone})`;
  }
  const md = (sch.month_days ?? []).join(", ");
  return `Monthly day ${md || "—"} at ${time} (${sch.timezone})`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type AutomationsPanelProps = {
  locked?: boolean;
  onOpenApproval: (args: AutomationApprovalOpenArgs) => void;
};

export function AutomationsPanel({ locked = false, onOpenApproval }: AutomationsPanelProps) {
  const [view, setView] = useState<View>({ kind: "overview" });
  const [rows, setRows] = useState<AutomationConnectorWire[]>([]);
  const [templates, setTemplates] = useState<PreviewTemplateWire[]>([]);
  const [linkedDests, setLinkedDests] = useState<Set<AutomationDestination>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);
  const [runs, setRuns] = useState<AutomationRunHistoryWire[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const templateNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of templates) m.set(t.template_id, t.name);
    return m;
  }, [templates]);

  const refresh = useCallback(async () => {
    setError(null);
    setStaleConflict(false);
    setLoading(true);
    try {
      const [list, tpl, platforms] = await Promise.all([
        listAutomations(),
        fetchPreviewTemplates().catch(() => ({ templates: [] as PreviewTemplateWire[] })),
        fetchConnectedPlatforms().catch(() => ({ platforms: [] }))
      ]);
      setRows(list.filter((r) => r.status !== "archived"));
      setTemplates(tpl.templates ?? []);
      const linked = new Set<AutomationDestination>();
      for (const p of platforms.platforms ?? []) {
        if (p.readiness === "available" || p.readiness === "needs_extension") {
          linked.add(p.destination as AutomationDestination);
        }
      }
      setLinkedDests(linked);
    } catch (err) {
      if (err instanceof RelayApiError && (err.code === "AUTOMATION_DISABLED" || err.status === 404)) {
        setError("Automations are turned off for this environment.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openHistory = useCallback(async (automation: AutomationConnectorWire) => {
    setView({ kind: "history", automation });
    setRunsLoading(true);
    setError(null);
    try {
      setRuns(await listAutomationRuns(automation.automation_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const withVersionConflict = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setStaleConflict(false);
    } catch (err) {
      if (err instanceof RelayApiError && (err.code === "AUTOMATION_VERSION_CONFLICT" || err.status === 409)) {
        setStaleConflict(true);
        setError("This Automation changed elsewhere. Refresh and try again.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  }, []);

  const togglePause = useCallback(
    async (row: AutomationConnectorWire) => {
      setBusyId(row.automation_id);
      setError(null);
      try {
        await withVersionConflict(async () => {
          await patchAutomation(row.automation_id, {
            version: row.version,
            status: row.status === "paused" ? "active" : "paused"
          });
          await refresh();
        });
      } catch {
        /* surfaced */
      } finally {
        setBusyId(null);
      }
    },
    [refresh, withVersionConflict]
  );

  const doArchive = useCallback(
    async (row: AutomationConnectorWire) => {
      setBusyId(row.automation_id);
      setError(null);
      try {
        await withVersionConflict(async () => {
          await archiveAutomation(row.automation_id);
          await refresh();
          setView({ kind: "overview" });
        });
      } catch {
        /* surfaced */
      } finally {
        setBusyId(null);
      }
    },
    [refresh, withVersionConflict]
  );

  const repairTemplate = useCallback(
    async (row: AutomationConnectorWire, templateId: string) => {
      setBusyId(row.automation_id);
      setError(null);
      try {
        await withVersionConflict(async () => {
          await patchAutomation(row.automation_id, {
            version: row.version,
            preview_template_id: templateId
          });
          await refresh();
        });
      } catch {
        /* surfaced */
      } finally {
        setBusyId(null);
      }
    },
    [refresh, withVersionConflict]
  );

  const needsRepair = useCallback(
    (row: AutomationConnectorWire) => {
      if (!row.preview_template_id) {
        return row.preset_kind === "preview_crosspost";
      }
      return !templateNameById.has(row.preview_template_id);
    },
    [templateNameById]
  );

  if (view.kind === "create") {
    return (
      <CreatePresetForm
        preset={view.preset}
        locked={locked}
        templates={templates}
        linkedDests={linkedDests}
        onCancel={() => setView({ kind: "overview" })}
        onCreated={async () => {
          await refresh();
          setView({ kind: "overview" });
        }}
      />
    );
  }

  if (view.kind === "history") {
    return (
      <section className="space-y-3" data-testid="automations-history">
        <div className="flex items-center justify-between gap-2">
          <div>
            <button
              type="button"
              className="text-xs text-[#9bf0c4] underline"
              onClick={() => setView({ kind: "overview" })}
              data-testid="automations-history-back"
            >
              Back to Automations
            </button>
            <h3 className="mt-1 text-sm font-semibold text-[#edf2ef]">
              History · {view.automation.title || presetLabel(view.automation.preset_kind)}
            </h3>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {runsLoading ? (
          <p className="text-xs text-[#9ca3af]" data-testid="automations-history-loading">
            Loading history…
          </p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-[#9ca3af]" data-testid="automations-history-empty">
            No runs yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.run_id}
                className="rounded-lg border border-white/[0.08] bg-[#111] px-3 py-2"
                data-testid={`automations-run-${run.run_id}`}
                data-run-status={run.status}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-[#edf2ef]">{runStatusLabel(run.status)}</p>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                      Due {formatWhen(run.due_at)}
                      {run.expires_at ? ` · expires ${formatWhen(run.expires_at)}` : ""}
                    </p>
                    {run.failure_reason ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">{run.failure_reason}</p>
                    ) : null}
                  </div>
                  {isReadyRun(run.status) && run.draft_id ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-[#9bf0c43d] bg-[#9bf0c414] px-2 py-1 text-[11px] text-[#9bf0c4]"
                      data-testid={`automations-run-open-approval-${run.run_id}`}
                      onClick={() =>
                        onOpenApproval({
                          automationId: run.automation_id,
                          runId: run.run_id,
                          draftId: run.draft_id
                        })
                      }
                    >
                      Review
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section
      className={`space-y-4 ${locked ? "opacity-60" : ""}`}
      data-testid="automations-overview"
      data-locked={locked ? "true" : undefined}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#edf2ef]">Presets</h3>
        <p className="mt-1 text-xs text-[#9ca3af]">
          {locked
            ? "Upgrade to Autopost to create Automations. You can still manage legacy routines below."
            : "Choose a preset. Prepared work always waits for your review before publishing."}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={locked}
            data-testid="automations-preset-preview-crosspost"
            onClick={() => !locked && setView({ kind: "create", preset: "preview_crosspost" })}
            className="rounded-lg border border-[rgba(155,240,196,0.2)] bg-[#9bf0c40a] p-3 text-left transition-colors hover:border-[#9bf0c43d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="text-sm font-medium text-[#edf2ef]">Preview &amp; crosspost</p>
            <p className="mt-1 text-[11px] text-[#9ca3af]">
              On a weekly or monthly schedule, prepare social previews for review.
            </p>
          </button>
          <button
            type="button"
            disabled={locked}
            data-testid="automations-preset-delayed-release"
            onClick={() => !locked && setView({ kind: "create", preset: "delayed_public_release" })}
            className="rounded-lg border border-[rgba(155,240,196,0.2)] bg-[#9bf0c40a] p-3 text-left transition-colors hover:border-[#9bf0c43d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="text-sm font-medium text-[#edf2ef]">Delayed public release</p>
            <p className="mt-1 text-[11px] text-[#9ca3af]">
              After Patreon publishes, wait N days then prepare destinations for review.
            </p>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#edf2ef]">Your Automations</h3>
          <button
            type="button"
            className="text-[11px] text-[#9bf0c4] underline"
            onClick={() => void refresh()}
            data-testid="automations-refresh"
          >
            Refresh
          </button>
        </div>

        {staleConflict ? (
          <p
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100"
            data-testid="automations-version-conflict"
            role="alert"
          >
            Version conflict — tap Refresh, then retry.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="text-xs text-[#9ca3af]" data-testid="automations-loading">
            Loading Automations…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-[var(--lib-fg-muted)]" data-testid="automations-list-empty">
            No Automations yet. Pick a preset above to create one.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="automations-list">
            {rows.map((row) => {
              const repair = needsRepair(row);
              const tplName = row.preview_template_id
                ? templateNameById.get(row.preview_template_id) ?? "Template missing"
                : "No template";
              return (
                <li
                  key={row.automation_id}
                  className="rounded-lg border border-white/[0.08] bg-[#111] px-3 py-2.5"
                  data-testid={`automations-row-${row.automation_id}`}
                  data-status={row.status}
                  data-repair={repair ? "true" : undefined}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#edf2ef]">
                        {row.title?.trim() || presetLabel(row.preset_kind)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                        {presetLabel(row.preset_kind)} · {statusLabel(row.status)}
                        {repair ? " · Repair needed" : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-[#c8d0cb]">{triggerSummary(row)}</p>
                      <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                        Destinations:{" "}
                        {row.target_destinations
                          .map((d) => DEST_LABELS[d] ?? d)
                          .join(", ") || "—"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                        Template: {tplName}
                        {row.next_occurrence_at
                          ? ` · Next ${formatWhen(row.next_occurrence_at)}`
                          : ""}
                        {row.latest_run_status
                          ? ` · Latest: ${runStatusLabel(row.latest_run_status)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!locked ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.automation_id}
                            className="rounded border border-[#2a2a2a] px-2 py-1 text-[11px] text-[#edf2ef]"
                            data-testid={`automations-pause-${row.automation_id}`}
                            onClick={() => void togglePause(row)}
                          >
                            {row.status === "paused" ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[#2a2a2a] px-2 py-1 text-[11px] text-[#edf2ef]"
                            data-testid={`automations-history-open-${row.automation_id}`}
                            onClick={() => void openHistory(row)}
                          >
                            History
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.automation_id}
                            className="rounded border border-[#3a2020] px-2 py-1 text-[11px] text-amber-200/90"
                            data-testid={`automations-archive-${row.automation_id}`}
                            onClick={() => void doArchive(row)}
                          >
                            Archive
                          </button>
                        </>
                      ) : null}
                      {row.latest_run_id &&
                      row.latest_run_status &&
                      isReadyRun(row.latest_run_status) ? (
                        <button
                          type="button"
                          className="rounded border border-[#9bf0c43d] bg-[#9bf0c414] px-2 py-1 text-[11px] text-[#9bf0c4]"
                          data-testid={`automations-open-approval-${row.automation_id}`}
                          onClick={() =>
                            onOpenApproval({
                              automationId: row.automation_id,
                              runId: row.latest_run_id!
                            })
                          }
                        >
                          Review ready
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {repair && !locked && templates.length > 0 ? (
                    <div className="mt-2" data-testid={`automations-repair-${row.automation_id}`}>
                      <label className="block text-[10px] uppercase tracking-wide text-[#68706c]">
                        Pick a saved template to repair
                      </label>
                      <select
                        className="mt-1 w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                        defaultValue=""
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id) void repairTemplate(row, id);
                        }}
                      >
                        <option value="" disabled>
                          Choose template…
                        </option>
                        {templates.map((t) => (
                          <option key={t.template_id} value={t.template_id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {repair && templates.length === 0 ? (
                    <p className="mt-2 text-[11px] text-amber-200/90">
                      No saved Previewizer templates.{" "}
                      <a href="/studio/autopost" className="underline text-[#9bf0c4]">
                        Create one in Previewizer
                      </a>{" "}
                      then refresh.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function CreatePresetForm({
  preset,
  locked,
  templates,
  linkedDests,
  onCancel,
  onCreated
}: {
  preset: AutomationPresetKind;
  locked: boolean;
  templates: PreviewTemplateWire[];
  linkedDests: Set<AutomationDestination>;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const isCrosspost = preset === "preview_crosspost";
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [localTime, setLocalTime] = useState("09:00");
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthDays, setMonthDays] = useState<number[]>([1]);
  const [offsetDays, setOffsetDays] = useState(30);
  const [destinations, setDestinations] = useState<AutomationDestination[]>(["x"]);
  const [templateId, setTemplateId] = useState(templates[0]?.template_id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationKey] = useState(() => newMutationKey());

  const toggleDest = (d: AutomationDestination) => {
    setDestinations((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const canSubmit =
    !locked &&
    destinations.length > 0 &&
    (!isCrosspost || Boolean(templateId)) &&
    (!isCrosspost || (cadence === "weekly" ? weekdays.length > 0 : monthDays.length > 0));

  const buildBody = (): CreateAutomationBody => {
    if (isCrosspost) {
      return {
        preset_kind: "preview_crosspost",
        title: title.trim() || null,
        schedule: {
          cadence,
          interval: 1,
          local_time: localTime,
          timezone,
          weekdays: cadence === "weekly" ? weekdays : [],
          month_days: cadence === "monthly" ? monthDays : []
        },
        target_destinations: destinations,
        preview_template_id: templateId,
        client_mutation_key: mutationKey
      };
    }
    return {
      preset_kind: "delayed_public_release",
      title: title.trim() || null,
      offset_days: offsetDays,
      target_destinations: destinations,
      preview_template_id: templateId || null,
      client_mutation_key: mutationKey
    };
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await createAutomation(buildBody());
      await onCreated();
    } catch (err) {
      if (err instanceof RelayApiError && err.code === "AUTOMATION_TEMPLATE_NOT_FOUND") {
        setFormError("That saved template is gone. Pick another or create one in Previewizer.");
      } else {
        setFormError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="space-y-3"
      data-testid={
        isCrosspost ? "automations-form-preview-crosspost" : "automations-form-delayed-release"
      }
    >
      <button
        type="button"
        className="text-xs text-[#9bf0c4] underline"
        onClick={onCancel}
        data-testid="automations-form-back"
      >
        Back
      </button>
      <h3 className="text-sm font-semibold text-[#edf2ef]">{presetLabel(preset)}</h3>
      <p className="text-xs text-[#9ca3af]">
        {isCrosspost
          ? "Schedule when to prepare social previews. You always confirm before anything posts."
          : "When a Patreon post goes live, wait a few days then prepare destination drafts for review."}
      </p>

      {formError ? (
        <p className="text-sm text-red-400" role="alert">
          {formError}
        </p>
      ) : null}

      {!confirming ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-[#68706c]">Name (optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
              data-testid="automations-form-title"
            />
          </label>

          {isCrosspost ? (
            <>
              <div className="flex gap-2">
                {(["weekly", "monthly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCadence(c)}
                    className={`rounded border px-2 py-1 text-[11px] ${
                      cadence === c
                        ? "border-[#9bf0c43d] bg-[#9bf0c414] text-[#9bf0c4]"
                        : "border-[#2a2a2a] text-[#9ca3af]"
                    }`}
                    data-testid={`automations-cadence-${c}`}
                  >
                    {c === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
              {cadence === "weekly" ? (
                <div className="flex flex-wrap gap-1" data-testid="automations-weekdays">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`rounded px-2 py-1 text-[11px] ${
                        weekdays.includes(i)
                          ? "bg-[#9bf0c4] text-[#050706]"
                          : "border border-[#2a2a2a] text-[#9ca3af]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#68706c]">
                    Day of month
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={monthDays[0] ?? 1}
                    onChange={(e) => setMonthDays([Math.max(1, Math.min(28, Number(e.target.value) || 1))])}
                    className="w-24 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                    data-testid="automations-month-day"
                  />
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#68706c]">Local time</span>
                  <input
                    type="time"
                    value={localTime}
                    onChange={(e) => setLocalTime(e.target.value)}
                    className="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                    data-testid="automations-local-time"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#68706c]">Timezone</span>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                    data-testid="automations-timezone"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-[#68706c]">
                Days after Patreon publish
              </span>
              <input
                type="number"
                min={1}
                max={365}
                value={offsetDays}
                onChange={(e) => setOffsetDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                data-testid="automations-offset-days"
              />
            </label>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#68706c]">Destinations</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SOCIAL_DESTS.map((d) => {
                const linked = linkedDests.has(d) || linkedDests.size === 0;
                const on = destinations.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!linked}
                    title={!linked ? "Connect this platform first" : undefined}
                    onClick={() => toggleDest(d)}
                    className={`rounded px-2 py-1 text-[11px] ${
                      on
                        ? "bg-[#9bf0c4] text-[#050706]"
                        : "border border-[#2a2a2a] text-[#9ca3af]"
                    } disabled:opacity-40`}
                    data-testid={`automations-dest-${d}`}
                  >
                    {DEST_LABELS[d] ?? d}
                    {!linked ? " (unlinked)" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#68706c]">
              Saved Previewizer template{isCrosspost ? " (required)" : " (optional)"}
            </p>
            {templates.length === 0 ? (
              <p
                className="mt-1 text-[11px] text-amber-200/90"
                data-testid="automations-no-templates"
              >
                No saved templates yet.{" "}
                <a href="/studio/autopost" className="underline text-[#9bf0c4]">
                  Create one in Previewizer
                </a>{" "}
                {isCrosspost ? "before creating this Automation." : "or continue without one."}
              </p>
            ) : (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="mt-1 w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-xs text-[#edf2ef]"
                data-testid="automations-template-select"
              >
                {!isCrosspost ? <option value="">None</option> : null}
                {templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9ca3af]"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || (isCrosspost && templates.length === 0)}
              className="rounded bg-[#9bf0c4] px-3 py-1.5 text-xs font-medium text-[#050706] disabled:opacity-40"
              data-testid="automations-form-continue"
              onClick={() => setConfirming(true)}
            >
              Review
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="automations-form-confirm">
          <p className="text-xs text-[#c8d0cb]">
            <strong className="text-[#edf2ef]">{presetLabel(preset)}</strong>
            {title.trim() ? ` · ${title.trim()}` : ""}
          </p>
          <ul className="space-y-1 text-[11px] text-[#9ca3af]">
            {isCrosspost ? (
              <li>
                Schedule: {cadence} at {localTime} ({timezone})
              </li>
            ) : (
              <li>Offset: {offsetDays} days after Patreon publish</li>
            )}
            <li>
              Destinations:{" "}
              {destinations.map((d) => DEST_LABELS[d] ?? d).join(", ")}
            </li>
            <li>
              Template:{" "}
              {templateId
                ? templates.find((t) => t.template_id === templateId)?.name ?? templateId
                : "None"}
            </li>
            <li>Nothing posts until you review and confirm.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9ca3af]"
              onClick={() => setConfirming(false)}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={submitting || !canSubmit}
              className="rounded bg-[#9bf0c4] px-3 py-1.5 text-xs font-medium text-[#050706] disabled:opacity-40"
              data-testid="automations-form-submit"
              onClick={() => void submit()}
            >
              {submitting ? "Creating…" : "Create Automation"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
