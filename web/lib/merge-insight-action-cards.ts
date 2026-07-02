import type {
  PerformanceInsightActionWire,
  PerformanceInsightActionsData
} from "@/lib/relay-api";

export type InsightActionCard = {
  id: string;
  title: string;
  trigger: string;
  body: string;
  actionLabel?: string;
  href?: string;
  tone: "active" | "watching" | "guidance";
  confidence?: "high" | "medium" | "low";
  source?: "legacy" | "performance";
};

function wireToCard(action: PerformanceInsightActionWire): InsightActionCard {
  return {
    id: action.id,
    title: action.title,
    trigger: action.trigger,
    body: action.body,
    actionLabel: action.action_label ?? undefined,
    href: action.href ?? undefined,
    tone: action.tone,
    confidence: action.confidence,
    source: "performance"
  };
}

const LEGACY_IDS_SUPPRESSED_BY_PERFORMANCE = new Set(["winning-format", "promo-post"]);

export function mergeInsightActionCards(
  legacyCards: InsightActionCard[],
  performanceReport: PerformanceInsightActionsData | null
): InsightActionCard[] {
  const performanceCards = (performanceReport?.actions ?? []).map(wireToCard);
  const hasPerformanceGrowthCards = performanceCards.some(
    (card) => card.id.startsWith("perf-") && card.tone === "active"
  );

  const filteredLegacy = legacyCards.filter((card) => {
    if (hasPerformanceGrowthCards && LEGACY_IDS_SUPPRESSED_BY_PERFORMANCE.has(card.id)) {
      return false;
    }
    return true;
  });

  return [...performanceCards, ...filteredLegacy.map((card) => ({ ...card, source: "legacy" as const }))].slice(
    0,
    8
  );
}
