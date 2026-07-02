import type { PlatformMetricScope, PlatformMetricSectionKey } from "./metric-registry-types.js";

export function defaultScopeForSection(section: PlatformMetricSectionKey): PlatformMetricScope {
  if (section === "platform_ops" || section === "data_coverage") return "system";
  if (section === "creator_health") return "creator";
  if (section === "patron_health") return "patron";
  if (section === "content_performance") return "post";
  if (section === "activity") return "session";
  return "platform";
}

export const REQUIRED_INVENTORY_FIELDS = [
  "key",
  "label",
  "section",
  "definition",
  "formula",
  "source",
  "initialStatus",
  "phase",
  "priority",
  "scope"
] as const;
