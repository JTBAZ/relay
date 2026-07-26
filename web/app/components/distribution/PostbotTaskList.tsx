"use client";

import { Loader2 } from "lucide-react";
import {
  patchPostbotTask,
  type DistributionVariantWire,
  type PostbotTaskWire,
} from "@/lib/relay-api";

const ACTION_LABEL: Record<PostbotTaskWire["action"], string> = {
  post: "Post",
  schedule: "Schedule",
  repost: "Repost",
  pin_comment: "Pin comment",
};

function formatSuggestedTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  variant: DistributionVariantWire;
  busyTaskId: string | null;
  onApplySchedule: (task: PostbotTaskWire) => void;
  onTaskUpdated: (task: PostbotTaskWire) => void;
  onTaskBusyChange: (taskId: string | null) => void;
};

export function PostbotTaskList({
  variant,
  busyTaskId,
  onApplySchedule,
  onTaskUpdated,
  onTaskBusyChange,
}: Props) {
  const tasks = (variant.postbot_tasks ?? []).filter((task) => task.status === "pending");
  if (tasks.length === 0) return null;

  async function dismissTask(task: PostbotTaskWire) {
    onTaskBusyChange(task.task_id);
    try {
      const { task: updated } = await patchPostbotTask(task.task_id, { status: "dismissed" });
      onTaskUpdated(updated);
    } finally {
      onTaskBusyChange(null);
    }
  }

  return (
    <div className="mb-2 space-y-1.5 rounded-lg border p-2" style={{ borderColor: "#1f2937", background: "#0d1110" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9bf0c4]">PostBot</p>
      {tasks.map((task) => {
        const busy = busyTaskId === task.task_id;
        return (
          <div key={task.task_id} className="rounded-md border px-2 py-1.5" style={{ borderColor: "#2a2a2a" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-[#d1d5db]">{ACTION_LABEL[task.action]}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#6b7280]">{task.rationale}</p>
                {task.suggested_time ? (
                  <p className="mt-1 text-[10px] text-[#9ca3af]">
                    Suggested: {formatSuggestedTime(task.suggested_time)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {task.action === "schedule" && task.suggested_time && !variant.scheduled_for ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApplySchedule(task)}
                    className="rounded border px-1.5 py-0.5 text-[9px] font-semibold disabled:opacity-50"
                    style={{ borderColor: "rgba(0,170,111,0.45)", color: "#9bf0c4" }}
                  >
                    {busy ? "…" : "Apply time"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void dismissTask(task)}
                  className="rounded border px-1.5 py-0.5 text-[9px] text-[#6b7280] disabled:opacity-50"
                  style={{ borderColor: "#2a2a2a" }}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : "Dismiss"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
