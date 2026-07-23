/**
 * Creator-owned Patreon OAuth (EH-040) — public kit surface.
 */

export {
  isCreatorOAuthConfigured,
  loadCreatorOAuthConfig,
  resolvePatreonMode,
  type CreatorOAuthConfig,
  type PatreonMode
} from "./config";
export {
  PatreonClient,
  PatreonOAuthError,
  DEFAULT_PATREON_AUTHORIZE_URL,
  DEFAULT_PATREON_TOKEN_URL,
  type PatreonTokenResponse
} from "./client";
export {
  PatreonTokenEncryption,
  decodePatreonTokenKey,
  PatreonTokenEncryptionError
} from "./crypto";
export {
  signPatreonOAuthState,
  verifyPatreonOAuthState,
  isSafeReturnPath,
  normalizeReturnPath,
  mintPkceVerifier,
  pkceChallengeS256,
  type PatreonOAuthStatePayload
} from "./state";
export {
  extractCampaignMembership,
  fetchPatreonIdentity,
  buildIdentityRequestUrl,
  PatreonIdentityError,
  type PatreonIdentityDocument,
  type CampaignMembershipExtraction
} from "./identity";
export {
  buildAuthorizeUrl,
  linkFromAuthorizationCode,
  refreshAndRelink
} from "./link";
export {
  createMemoryPatreonLinkStore,
  buildPatreonEntitlementSnapshot,
  type PatreonLinkStore,
  type PatreonIdentityLinkRecord,
  type PatreonCredentialRecord
} from "./store";
export { isSameOriginOAuthStart } from "./csrf";
export {
  isRelayManagedConfigured,
  isRelayVerifyKillSwitchOff,
  loadRelayManagedConfig,
  resolveRelayCallbackUrl,
  verifyRelayAssertion,
  buildRelayManagedStartUrl,
  handleRelayManagedCallback,
  buildRelayMigrationMetadataExport,
  previewAssertionReplayStore,
  type RelayManagedConfig
} from "./relay-managed";
export {
  buildOAuthChoiceDisclosures,
  buildPatreonVerificationHealthSummary,
  buildManagedBoundedOutageCopy,
  creatorOAuthSetupChecklist,
  defaultOAuthChoiceSelection,
  isValidOAuthChoiceOption,
  observeManagedConnectorPrice,
  relayManagedSetupChecklist,
  switchOffMigrationSteps,
  DEFAULT_MANAGED_CONNECTOR_MONTHLY_CENTS,
  type ManagedPriceHonesty,
  type OAuthChoiceDisclosure,
  type OAuthChoiceOptionId,
  type PatreonVerificationHealthSummary
} from "./oauth-choice";
export {
  buildSwitchOffResult,
  emptyPatreonModePreference,
  loadPatreonModePreference,
  savePatreonModePreference,
  switchOffToCreatorOAuth,
  PATREON_MODE_PREFERENCE_CONTRACT,
  PATREON_MODE_PREFERENCE_FILENAME,
  type PatreonModePreference,
  type SwitchOffResult
} from "./mode-preference";
