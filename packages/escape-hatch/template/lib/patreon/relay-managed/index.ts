/**
 * Relay-managed Patreon verification (EH-041) + billing honesty (EH-042).
 */

export {
  isRelayManagedConfigured,
  isRelayVerifyKillSwitchOff,
  loadRelayManagedConfig,
  resolveRelayCallbackUrl,
  type RelayManagedConfig
} from "./config";
export {
  verifyRelayAssertion,
  parseAssertionKeysJson,
  RELAY_ASSERTION_ALG,
  type RelayAssertionClaims,
  type RelayAssertionPublicKey
} from "./assertion";
export {
  buildRelayManagedStartUrl,
  signRelayManagedState,
  verifyRelayManagedState,
  mintRelayNonce,
  type RelayManagedStatePayload
} from "./start";
export {
  handleRelayManagedCallback,
  buildRelayMigrationMetadataExport,
  type HandleRelayCallbackResult,
  type RelayMigrationMetadataExport
} from "./callback";
export {
  createMemoryAssertionReplayStore,
  previewAssertionReplayStore,
  type AssertionReplayStore
} from "./replay";
export {
  observeConnectorBilling,
  buildStaleWarning,
  type ConnectorBillingHonesty,
  type ConnectorBillingState,
  type ConnectorBillingEnvBag
} from "./billing";
