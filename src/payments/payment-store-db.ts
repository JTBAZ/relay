/**
 * @fileoverview Prisma-backed `PaymentStore`: `CreatorPaymentConfig` payload + `PaymentCheckout` inserts.
 * @description JSON config is stored verbatim in `payload`; checkouts append as relational rows.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `CreatorPaymentConfig`, `PaymentCheckout`
 */
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { PaymentStore } from "./payment-store.js";
import type { CheckoutResult, PaymentConfig } from "./types.js";

/** Postgres implementation of {@link PaymentStore}. */
export class DbPaymentStore implements PaymentStore {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Upserts creator payment JSON payload.
   * @async
   * @throws {Error} Prisma client errors (unique violations, connectivity).
   */
  public async upsertConfig(config: PaymentConfig): Promise<void> {
    const payload = config as unknown as Prisma.InputJsonValue;
    await this.prisma.creatorPaymentConfig.upsert({
      where: { creatorId: config.creator_id },
      create: { creatorId: config.creator_id, payload },
      update: { payload }
    });
  }

  /**
   * Fetches payment config payload for a Relay creator id.
   * @async
   * @throws {Error} Prisma read errors.
   */
  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    const row = await this.prisma.creatorPaymentConfig.findUnique({
      where: { creatorId }
    });
    if (!row) {
      return null;
    }
    return row.payload as PaymentConfig;
  }

  /**
   * Inserts a checkout audit row (append-only).
   * @async
   * @throws {Error} On unique `checkoutId` conflict or DB errors.
   */
  public async appendCheckout(checkout: CheckoutResult): Promise<void> {
    await this.prisma.paymentCheckout.create({
      data: {
        checkoutId: checkout.checkout_id,
        tierId: checkout.tier_id,
        provider: checkout.provider,
        status: checkout.status,
        amountCents: checkout.amount_cents,
        currency: checkout.currency,
        dryRun: checkout.dry_run,
        processedAt: new Date(checkout.processed_at),
        errorMessage: checkout.error_message ?? null
      }
    });
  }
}
