"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreateEventPayload } from "./AddEventPopover";
import {
  fetchSocialPlaybookTemplates,
  formatPlaybookOffsetLabel,
  resolvePlaybookTimelineIso,
  type ApplySocialPlaybookBody,
  type SocialPlaybookTemplateKey,
  type SocialPlaybookTemplateWire,
} from "@/lib/social-playbooks-api";

export type PlaybookEventSeed = {
  payload: CreateEventPayload;
  created: {
    id: string;
    post_id?: string | null;
    draft_id?: string | null;
    due_at?: string;
  };
  timeZone: string;
  autopostAllowed: boolean;
  upgradeHref?: string;
};

type FollowUpPlaybookPromptProps = {
  seed: PlaybookEventSeed;
  busy?: boolean;
  error?: string | null;
  onSkip: () => void;
  onApply: (body: ApplySocialPlaybookBody) => void | Promise<void>;
};

function formatDueLabel(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function FollowUpPlaybookPrompt({
  seed,
  busy,
  error,
  onSkip,
  onApply,
}: FollowUpPlaybookPromptProps) {
  const [templates, setTemplates] = useState<SocialPlaybookTemplateWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<SocialPlaybookTemplateKey | null>(null);
  const [disabledSteps, setDisabledSteps] = useState<Set<number>>(new Set());

  const dueAt = seed.created.due_at || seed.payload.due_at;
  const gated = !seed.autopostAllowed;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSocialPlaybookTemplates()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.template_key === selectedKey) ?? null,
    [templates, selectedKey]
  );

  function selectTemplate(key: SocialPlaybookTemplateKey) {
    setSelectedKey(key);
    setDisabledSteps(new Set());
  }

  function toggleStep(stepIndex: number) {
    setDisabledSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
  }

  async function handleApply() {
    if (!selected || gated || busy) return;
    const postId = seed.created.post_id?.trim();
    if (!postId) return;
    const destination =
      seed.payload.destination ||
      seed.payload.destinations?.[0] ||
      "patreon";
    const destinations =
      seed.payload.destinations?.length
        ? seed.payload.destinations
        : [destination];

    const body: ApplySocialPlaybookBody = {
      template_key: selected.template_key,
      anchor_due_at: dueAt,
      anchor_post_id: postId,
      anchor_task_id: seed.created.id,
      destination,
      destinations,
      remind_me: seed.payload.remind_me,
      step_overrides: selected.atoms.map((a) => ({
        step_index: a.step_index,
        enabled: !disabledSteps.has(a.step_index),
      })),
    };

    await onApply(body);
  }

  return (
    <div
      className="w-[300px] rounded-xl border border-[#2a2f2c] bg-[#0d100e] p-3 shadow-xl"
      data-testid="follow-up-playbook-prompt"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7773]">
        Follow-up
      </p>
      <p className="mt-2 text-[13px] font-medium text-[#edf2ef]">
        Add a follow-up playbook?
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#8b938e]">
        Queue industry-standard reminder and draft steps relative to this post. You can turn
        individual steps off before confirming.
      </p>

      {loading ? (
        <p className="mt-3 text-[11px] text-[#8b938e]">Loading templates…</p>
      ) : loadError ? (
        <p className="mt-3 text-[11px] text-red-400" role="alert">
          {loadError}
        </p>
      ) : !selected ? (
        <div className="mt-3 flex flex-col gap-1.5" data-testid="playbook-template-list">
          {templates.map((t) => (
            <button
              key={t.template_key}
              type="button"
              disabled={busy}
              onClick={() => selectTemplate(t.template_key)}
              className="rounded-md border border-[#2a2f2c] px-3 py-2 text-left hover:border-[#3d4540] disabled:opacity-40"
              data-testid={`playbook-template-${t.template_key}`}
            >
              <span className="block text-[12px] text-[#edf2ef]">{t.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-[#8b938e]">
                {t.description}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3" data-testid="playbook-timeline-preview">
          <div>
            <p className="text-[12px] font-medium text-[#edf2ef]">{selected.label}</p>
            <p className="mt-0.5 text-[10px] text-[#8b938e]">{selected.description}</p>
          </div>
          <ul className="space-y-1.5">
            {selected.atoms.map((atom) => {
              const enabled = !disabledSteps.has(atom.step_index);
              const whenIso = resolvePlaybookTimelineIso(dueAt, atom.offset_minutes);
              return (
                <li key={atom.step_index}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={enabled}
                    disabled={busy}
                    onClick={() => toggleStep(atom.step_index)}
                    className={`flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
                      enabled
                        ? "border-[#2a4a3a] bg-[#121816]"
                        : "border-[#2a2f2c] bg-[#0a0c0b] opacity-60"
                    }`}
                    data-testid={`playbook-step-${atom.step_index}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#edf2ef]">{atom.label}</span>
                      <span className="text-[10px] text-[#9bf0c4]">
                        {formatPlaybookOffsetLabel(atom.offset_minutes)}
                      </span>
                    </span>
                    <span className="text-[10px] text-[#8b938e]">
                      {formatDueLabel(whenIso, seed.timeZone)} · {atom.execution_mode}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelectedKey(null)}
              className="flex-1 rounded-md border border-[#2a2f2c] py-1.5 text-[11px] text-[#8b938e]"
            >
              Back
            </button>
            <button
              type="button"
              disabled={
                busy ||
                gated ||
                selected.atoms.every((a) => disabledSteps.has(a.step_index))
              }
              onClick={() => void handleApply()}
              className="flex-1 rounded-md bg-[#c8f0d8] py-1.5 text-[11px] font-semibold text-[#0d100e] disabled:opacity-40"
              data-testid="playbook-apply"
            >
              {busy ? "Applying…" : "Apply playbook"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onSkip}
        className="mt-3 w-full rounded-md border border-[#2a2f2c] px-3 py-2 text-left text-[12px] text-[#edf2ef] hover:border-[#3d4540] disabled:opacity-40"
        data-testid="playbook-skip"
      >
        Skip playbook
      </button>

      {gated ? (
        <p className="mt-2 text-[10px] text-[#8b938e]">
          Playbooks need Autopost.{" "}
          <a href={seed.upgradeHref || "/studio/autopost"} className="text-[#c8f0d8] underline">
            Upgrade
          </a>
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
