import type { CloneService } from "../clone/clone-service.js";
import { runPreflight } from "./preflight.js";
import type { FilePaymentStore } from "./payment-store.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type {
  CheckoutResult,
  PaymentConfig,
  PreflightResult,
  TierProductMapping
} from "./types.js";

export class PaymentService {
  private readonly paymentStore: FilePaymentStore;
  private readonly cloneService: CloneService;
  private readonly adapters: Map<string, ProviderAdapter>;

  public constructor(
    paymentStore: FilePaymentStore,
    cloneService: CloneService,
    adapters: Map<string, ProviderAdapter>
  ) {
    this.paymentStore = paymentStore;
    this.cloneService = cloneService;
    this.adapters = adapters;
  }

  public async saveConfig(config: PaymentConfig): Promise<void> {
    await this.paymentStore.upsertConfig(config);
  }

  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    return this.paymentStore.getConfig(creatorId);
  }

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

    const mapping = config.mappings.find((m) => m.tier_id === tierId);
    if (!mapping) {
      throw new Error(`No payment mapping for tier ${tierId}.`);
    }

    const adapter = this.adapters.get(mapping.provider);
    if (!adapter) {
      throw new Error(`Provider ${mapping.provider} not configured.`);
    }

    const result = await adapter.processCheckout({
      mapping,
      user_id: userId,
      email,
      dry_run: dryRun
    });

    await this.paymentStore.appendCheckout(result);
    return result;
  }

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
