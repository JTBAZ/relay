/**
 * Generated-app access surface — re-exports from the embedded contracts module.
 * Authoritative types + preview evaluator live in `./contracts` (copied from
 * packages/escape-hatch/src/contracts.ts by fill-template). Do not maintain a
 * second access implementation here.
 *
 * Soft-gate only — not production authorization.
 */

export {
  canAccessPost,
  canViewPost,
  buildTierCatalog,
  isFreeTier,
  paidUserTierIds,
  tierFloorCents,
  userMeetsTierGatesWithOrdering,
  parseSiteBundle,
  serializeSiteBundle,
  ContractValidationError,
  SITE_BUNDLE_CONTRACT_VERSION,
  GENERATED_APP_DATA_CONTRACT_VERSION,
  RELAY_TIER_PUBLIC,
  RELAY_TIER_ALL_PATRONS
} from "./contracts";

export type {
  AccessLevel,
  PaywallStyle,
  ColorScheme,
  TierMatchMode,
  CloneTierRule,
  CloneMediaRef,
  PostAccess,
  ClonePostEntry,
  EscapeHatchTheme,
  DemoPersona,
  SiteBundle,
  PreviewTierEntry,
  ContractIssue
} from "./contracts";
