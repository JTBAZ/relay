/**
 * Escape Hatch site bundle types — re-exported from the canonical contracts module.
 * Prefer importing from `./contracts.js` for validators and version constants.
 */

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
  CloneSiteModelInput,
  ExportMediaRecordInput,
  CreatorExportIndexInput,
  PreviewTierEntry,
  SiteBundleContractVersion,
  CloneSiteModelContractVersion,
  ContractIssue
} from "./contracts.js";

export {
  SITE_BUNDLE_CONTRACT_VERSION,
  SITE_BUNDLE_CONTRACT_VERSION_LEGACY,
  CLONE_SITE_MODEL_CONTRACT_VERSION,
  CLONE_SITE_MODEL_CONTRACT_VERSION_LEGACY,
  GENERATED_APP_DATA_CONTRACT_VERSION,
  ACCESS_LEVELS,
  PAYWALL_STYLES,
  COLOR_SCHEMES,
  TIER_MATCH_MODES,
  RELAY_TIER_PUBLIC,
  RELAY_TIER_ALL_PATRONS,
  ContractValidationError,
  parseSiteBundle,
  parseCloneSiteModelInput,
  serializeSiteBundle,
  serializeCloneSiteModelInput
} from "./contracts.js";
