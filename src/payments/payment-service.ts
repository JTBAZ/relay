/**
 * @fileoverview Application service: payment config CRUD, preflight, checkout orchestration, and live-mode toggles.
 * @description Delegates persistence to `PaymentStore` and clone tier truth to `CloneService`.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `CreatorPaymentConfig`, `PaymentCheckout` when using `DbPaymentStore`
 */
import type { CloneService } from "../clone/clone-service.js";
import { runPreflight } from "./preflight.js";
import type { PaymentStore } from "./payment-store.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import {
  recordCheckoutRevenueTelemetry,
  type RevenueTelemetryWriterConfig
} from "../platform-metrics/platform-revenue-telemetry-service.js";
import type {
  CheckoutResult,
  PaymentConfig,
  PreflightResult,
  TierProductMapping
} from "./types.js";

/** Coordinates payment configuration and checkout with provider adapters. */
export class PaymentService {
  private readonly paymentStore: PaymentStore;
  private readonly cloneService: CloneService;
  private readonly adapters: Map<string, ProviderAdapter>;
  private readonly revenueTelemetry?: RevenueTelemetryWriterConfig;

  /**
   * @param paymentStore Backing store (file or DB).
   * @param cloneService Source of tier rules for preflight.
   * @param adapters Provider registry (`stripe`, `paypal`, …).
   * @param revenueTelemetry Optional PMD-061 writer config for platform revenue events.
   */
  public constructor(
    paymentStore: PaymentStore,
    cloneService: CloneService,
    adapters: Map<string, ProviderAdapter>,
    revenueTelemetry?: RevenueTelemetryWriterConfig
  ) {
    this.paymentStore = paymentStore;
    this.cloneService = cloneService;
    this.adapters = adapters;
    this.revenueTelemetry = revenueTelemetry;
  }

  /**
   * Upserts a creator payment configuration.
   * @async
   * @throws {Error} On store I/O or Prisma errors from the underlying `PaymentStore`.
   */
  public async saveConfig(config: PaymentConfig): Promise<void> {
    await this.paymentStore.upsertConfig(config);
  }

  /**
   * Loads payment config for a creator.
   * @async
   * @throws {Error} On persistence read failures.
   */
  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    return this.paymentStore.getConfig(creatorId);
  }

  /**
   * Runs {@link runPreflight} against the latest clone site tiers.
   * @async
   * @throws {Error} When clone or payment store reads fail.
   */
  public async preflight(creatorId: string): Promise<PreflightResult> {
    const config = await this.paymentStore.getConfig(creatorId);
    if (!config) {
      return {
        creator_id: creatorId,
        pass: false,
        checked_at: new Date().toISOString(),
        issues: [
          {
            tier_id: "*",
            code: "NO_CONFIG",
            message: "No payment config found for this creator.",
            severity: "error"
          }
        ],
        mappings_checked: 0
      };
    }
    const site = await this.cloneService.getLatest(creatorId);
    const cloneTiers = site?.tiers ?? [];
    return runPreflight(config, cloneTiers, this.adapters);
  }

  /**
   * Executes checkout: resolves mapping and adapter, then appends checkout result to store.
   * @async
   * @throws {Error} Missing config/mapping/provider, blocked live checkout, or downstream adapter/store errors.
   */
  public async checkout(
    creatorId: string,
    tierId: string,
    userId: string,
    email: string,
    dryRun: boolean
  ): Promise<CheckoutResult> {
    const config = await this.paymentStore.getConfig(creatorId);
    if (!config) {
      throw new Error("No payment config found.");
    }

    if (!dryRun && !config.live_mode) {
      throw new Error("Live checkout blocked: payment config is not in live mode. Use dry_run=true or enable live_mode.");
    }

    // [R-SEC-07 @security-review 2026-06] Provider adapters are stubs today (no real Stripe/PayPal charge
    // or webhook verification — see provider-adapter.ts). Refuse non-dry-run checkout in production until a
    // verified integration ships and RELAY_ALLOW_LIVE_PAYMENTS=1 is explicitly set, so a stub can never
    // report a "successful" payment that never charged. See docs/security-review-2026-06.md.
    if (
      !dryRun &&
      process.env.NODE_ENV === "production" &&
      process.env.RELAY_ALLOW_LIVE_PAYMENTS !== "1"
    ) {
      throw new Error(
        "Live checkout is disabled in production until a verified payment integration is enabled (set RELAY_ALLOW_LIVE_PAYMENTS=1 once real gateway + webhook verification ship)."
      );
    }

    const mapping = config.mappings.find((m) => m.tier_id === tierId);
    if (!mapping) {
      throw new Error(`No payment mapping for tier ${tierId}.`);
    }

    const adapter = this.adapters.get(mapping.provider);
    if (!adapter) {
      throw new Error(`Provider ${mapping.provider} not configured.`);
    }

    if (this.revenueTelemetry) {
      await recordCheckoutRevenueTelemetry({
        cfg: this.revenueTelemetry,
        phase: "started",
        creatorId,
        mapping
      });
    }

    const result = await adapter.processCheckout({
      mapping,
      user_id: userId,
      email,
      dry_run: dryRun
    });

    if (this.revenueTelemetry) {
      await recordCheckoutRevenueTelemetry({
        cfg: this.revenueTelemetry,
        phase: result.status === "failed" ? "failed" : "completed",
        creatorId,
        mapping,
        result
      });
    }

    await this.paymentStore.appendCheckout(result);
    return result;
  }

  /**
   * Adds or replaces a tier mapping on the creator’s config (creates shell config if absent).
   * @async
   * @throws {Error} On persistence errors.
   */
  public async addMapping(
    creatorId: string,
    mapping: TierProductMapping
  ): Promise<PaymentConfig> {
    let config = await this.paymentStore.getConfig(creatorId);
    if (!config) {
      config = {
        creator_id: creatorId,
        default_currency: mapping.currency,
        default_billing_interval: mapping.billing_interval,
        mappings: [],
        live_mode: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    const idx = config.mappings.findIndex((m) => m.tier_id === mapping.tier_id);
    if (idx >= 0) {
      config.mappings[idx] = mapping;
    } else {
      config.mappings.push(mapping);
    }
    config.updated_at = new Date().toISOString();
    await this.paymentStore.upsertConfig(config);
    return config;
  }

  /**
   * Toggles `live_mode` for a creator (no-op returns null when config missing).
   * @async
   * @throws {Error} On persistence errors.
   */
  public async setLiveMode(
    creatorId: string,
    live: boolean
  ): Promise<PaymentConfig | null> {
    const config = await this.paymentStore.getConfig(creatorId);
    if (!config) return null;
    config.live_mode = live;
    config.updated_at = new Date().toISOString();
    await this.paymentStore.upsertConfig(config);
    return config;
  }
}
