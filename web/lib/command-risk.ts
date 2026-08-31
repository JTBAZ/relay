/** Highest Command Layer risk class on a ChangeSet (RC-P4-T01). */

export const COMMAND_RISK_CLASSES = ["execute_undo", "review", "publish_confirm"] as const;
export type CommandRiskClass = (typeof COMMAND_RISK_CLASSES)[number];

const RANK: Record<CommandRiskClass, number> = {
  execute_undo: 1,
  review: 2,
  publish_confirm: 3
};

export function isCommandRiskClass(value: string): value is CommandRiskClass {
  return (COMMAND_RISK_CLASSES as readonly string[]).includes(value);
}

export function highestCommandRisk(
  ops: ReadonlyArray<{ risk_class?: string }> | undefined
): CommandRiskClass {
  let top: CommandRiskClass = "execute_undo";
  for (const op of ops ?? []) {
    const raw = typeof op.risk_class === "string" ? op.risk_class : "";
    if (!isCommandRiskClass(raw)) continue;
    if (RANK[raw] > RANK[top]) top = raw;
  }
  return top;
}

export function isStaleChangeSetError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const message = err instanceof Error ? err.message : String(err);
  return code === "COMMAND_STALE_SELECTION" || /stale/i.test(message);
}
