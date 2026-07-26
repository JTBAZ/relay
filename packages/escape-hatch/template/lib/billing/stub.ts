/**
 * Stub BillingProvider (EH-050 default).
 * Honest health: not ready. Money-path methods fail closed.
 * Lifecycle normalize + entitlement apply helpers are available for tests.
 */

import type { AdapterHealth, BillingProvider } from "../adapters/types";
import { normalizeWebhookEvent } from "./normalize";
import {
  getBillingCapabilityMatrix,
  getBillingPolicyDeclaration,
  reportBillingReadiness
} from "./readiness";
import {
  BILLING_NOT_IMPLEMENTED,
  type BillingAccountConnection,
  type BillingCheckoutSession,
  type BillingMigrationMapping,
  type BillingPortalSession,
  type BillingPrice,
  type BillingProduct,
  type BillingResult,
  type BillingWebhookEnvelope,
  type NormalizeWebhookResult
} from "./types";

function fail<T = never>(reason: string = BILLING_NOT_IMPLEMENTED): BillingResult<T> {
  return { ok: false, reason };
}

export function createStubBillingProvider(): BillingProvider {
  return {
    id: "billing",
    implementation: "stub",

    async health(): Promise<AdapterHealth> {
      const r = reportBillingReadiness("stub");
      return { ok: false, reason: r.reason };
    },

    isSandboxMode() {
      return true;
    },

    getCapabilityMatrix() {
      return getBillingCapabilityMatrix("stub");
    },

    getReadiness() {
      return reportBillingReadiness("stub");
    },

    getPolicyDeclaration() {
      return getBillingPolicyDeclaration("stub");
    },

    async connectAccount() {
      return fail<BillingAccountConnection>(
        "stub_connect_account — live account connect is EH-051"
      );
    },

    async validateAccount() {
      return fail<BillingAccountConnection>(
        "stub_validate_account — not configured"
      );
    },

    async listProducts() {
      return fail<BillingProduct[]>("stub_list_products");
    },

    async createProduct() {
      return fail<BillingProduct>("stub_create_product");
    },

    async updateProduct() {
      return fail<BillingProduct>("stub_update_product");
    },

    async listPrices() {
      return fail<BillingPrice[]>("stub_list_prices");
    },

    async createPrice() {
      return fail<BillingPrice>("stub_create_price");
    },

    async updatePrice() {
      return fail<BillingPrice>("stub_update_price");
    },

    async createCheckoutSession() {
      return fail<BillingCheckoutSession>(
        "stub_create_checkout — independent Stripe Checkout is EH-051"
      );
    },

    async createCustomerPortalSession() {
      return fail<BillingPortalSession>(
        "stub_create_portal — Customer Portal is EH-051"
      );
    },

    async verifyWebhookSignature() {
      return fail<{ verified: true }>(
        "stub_verify_webhook — signature verify is EH-051; use normalize helpers only after a real adapter verifies"
      );
    },

    normalizeWebhookEvent(envelope: BillingWebhookEnvelope): NormalizeWebhookResult {
      // Stub still runs the shared fail-closed normalizer (signature required).
      return normalizeWebhookEvent(envelope, {
        provider: "stub",
        requireSignature: true
      });
    },

    async exportMigrationMapping() {
      return fail<BillingMigrationMapping>(
        "stub_migration_export — export mapping ships with EH-051 live adapter"
      );
    }
  };
}
