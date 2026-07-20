/**
 * Safe human labels for Goal Cycle / Coach progress message codes.
 * Never render raw provider text — only known codes map to copy.
 */

const KNOWN_PROGRESS_LABELS: Record<string, string> = {
  credit_reserved: "Reserved a Coach Plan credit",
  facts_loaded: "Loaded your Studio facts",
  history_loaded: "Loaded your posting history",
  interest_started: "Checking interest signals",
  interest_complete: "Interest signals ready",
  web_started: "Checking controlled web sources",
  web_complete: "Web sources ready",
  evidence_weak: "Evidence is weak — continuing from your history",
  history_fallback: "Falling back to your history",
  research_complete: "Research complete",
  research_failed: "Research failed — you can retry",
  questions_ready: "Clarifying questions ready",
  plan_ready: "Plan ready to review",
  fallback_ready: "Deterministic fallback Plan ready"
};

export function labelCoachProgressCode(messageCode: string): string {
  const known = KNOWN_PROGRESS_LABELS[messageCode];
  if (known) return known;
  // Unknown codes stay opaque — never echo provider/AI text.
  return "Working…";
}
