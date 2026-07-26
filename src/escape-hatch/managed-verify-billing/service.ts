/**
 * Relay managed-verify billing entitlement service (EH-042).
 * Webhook truth → entitlement state → gate assertion minting.
 */

import { buildCancellationCopy } from "./cancellation-copy.js";
import {
  resolveManagedVerifyBillingConfig,
  type ManagedVerifyBillingResolvedConfig
} from "./config.js";
import {
  gateManagedVerifyIssuance,
  refreshBillingStateForNow
} from "./entitlement.js";
import {
  createMemoryManagedVerifyBillingStore,
  type ManagedVerifyBillingStore
} from "./store.js";
import { applyManagedVerifyBillingWebhook } from "./webhook.js";
import {
  mintTestWebhookSignature,
  verifyManagedVerifyBillingWebhookSignature
} from "./webhook-signature.js";
import type {
  ManagedVerifyAddonProduct,
  ManagedVerifyBillingGateResult,
  ManagedVerifyBillingRecord,
  ManagedVerifyCancellationCopy,
  ManagedVerifyBillingWebhookApplyResult
} from "./types.js";

export type ManagedVerifyBillingService = {
  isEnabled(): boolean;
  product(): ManagedVerifyAddonProduct;
  getRecord(siteId: string): ManagedVerifyBillingRecord | null;
  /** Upsert for tests / admin mirrors — not a client-claim path. */
  putRecord(record: ManagedVerifyBillingRecord): ManagedVerifyBillingRecord;
  assertCanIssue(args: {
    siteId: string;
    nowMs?: number;
  }): ManagedVerifyBillingGateResult;
  handleWebhook(args: {
    rawBody: Buffer | string;
    signatureHeader: string | undefined;
    nowMs?: number;
  }): ManagedVerifyBillingWebhookApplyResult;
  cancellationCopy(siteId: string): ManagedVerifyCancellationCopy;
  /** Admin / kit honesty payload (no secrets). */
  honesty(siteId: string): {
    sku: string;
    enabled: boolean;
    state: string;
    lastServiceDateIso: string | null;
    staleWarning: string;
    migrationSteps: string[];
    patronsPreserved: true;
    nativeContinuesWorking: string;
    productionSafe: false;
  };
  _store: ManagedVerifyBillingStore;
  _config: ManagedVerifyBillingResolvedConfig;
};

export type CreateManagedVerifyBillingServiceArgs = {
  env?: NodeJS.ProcessEnv;
  store?: ManagedVerifyBillingStore;
  config?: ManagedVerifyBillingResolvedConfig;
};

export function createManagedVerifyBillingService(
  args: CreateManagedVerifyBillingServiceArgs = {}
): ManagedVerifyBillingService {
  const env = args.env ?? process.env;
  const config = args.config ?? resolveManagedVerifyBillingConfig(env);
  const store = args.store ?? createMemoryManagedVerifyBillingStore();

  const service: ManagedVerifyBillingService = {
    _store: store,
    _config: config,

    isEnabled() {
      return config.enabled;
    },

    product() {
      return config.product;
    },

    getRecord(siteId) {
      const rec = store.get(siteId);
      return rec ? refreshBillingStateForNow(rec) : null;
    },

    putRecord(record) {
      return store.upsert(refreshBillingStateForNow(record));
    },

    assertCanIssue({ siteId, nowMs }) {
      const record = store.get(siteId);
      const gate = gateManagedVerifyIssuance({
        enabled: config.enabled,
        record,
        nowMs
      });
      if (gate.record && gate.record !== record) {
        store.upsert(gate.record);
      }
      return gate;
    },

    handleWebhook({ rawBody, signatureHeader, nowMs }) {
      const sig = verifyManagedVerifyBillingWebhookSignature({
        rawBody,
        signatureHeader,
        secret: config.webhookSecret,
        signatureRequired: config.signatureRequired,
        nowMs
      });
      if (!sig.ok) {
        return {
          ok: false,
          reason: sig.reason,
          httpStatus: sig.reason === "webhook_secret_required" ? 503 : 400
        };
      }

      let payload: unknown;
      try {
        const text =
          typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
        payload = JSON.parse(text) as unknown;
      } catch {
        return { ok: false, reason: "invalid_json", httpStatus: 400 };
      }

      return applyManagedVerifyBillingWebhook({
        store,
        product: config.product,
        graceDays: config.graceDays,
        payload,
        nowMs
      });
    },

    cancellationCopy(siteId) {
      const record = service.getRecord(siteId);
      return buildCancellationCopy({
        state: record?.state ?? "none",
        record
      });
    },

    honesty(siteId) {
      const copy = service.cancellationCopy(siteId);
      return {
        sku: copy.sku,
        enabled: config.enabled,
        state: copy.state,
        lastServiceDateIso: copy.lastServiceDateIso,
        staleWarning: copy.staleWarning,
        migrationSteps: copy.migrationSteps,
        patronsPreserved: true,
        nativeContinuesWorking: copy.nativeContinuesWorking,
        productionSafe: false
      };
    }
  };

  return service;
}

export { mintTestWebhookSignature };
