"use client";

import type { Lab2HarnessInterpretResult } from "@/lib/relay-api";
import type { CommandRiskClass } from "@/lib/command-risk";

type Preview = Extract<Lab2HarnessInterpretResult, { kind: "preview" }>;

const RISK_COPY: Record<CommandRiskClass, string> = {
  execute_undo: "Safe internal change. Apply now; Undo is available after.",
  review: "Compact review — one ChangeSet, then Apply. Not a publish.",
  publish_confirm: "Command Layer does not publish. Use the existing destination handoff."
};

export default function ChangeSetSummary({
  preview,
  risk
}: {
  preview: Preview;
  risk: CommandRiskClass;
}) {
  return (
    <div
      className="mt-2 text-[11px] text-[#8aa090]"
      data-lab2-command-preview
      data-command-summary
      data-command-risk={risk}
      aria-live="polite"
    >
      <p className="text-[#d0ddd4]">{preview.summary}</p>
      {preview.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      <p data-command-risk-copy>{RISK_COPY[risk]}</p>
      {!preview.apply_ready ? <p>Nothing to apply — review the report above.</p> : null}
    </div>
  );
}
