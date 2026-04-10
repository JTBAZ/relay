import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { PaymentStore } from "./payment-store.js";
import type { CheckoutResult, PaymentConfig } from "./types.js";

export class DbPaymentStore implements PaymentStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async upsertConfig(config: PaymentConfig): Promise<void> {
    const payload = config as unknown as Prisma.InputJsonValue;
    await this.prisma.creatorPaymentConfig.upsert({
      where: { creatorId: config.creator_id },
      create: { creatorId: config.creator_id, payload },
      update: { payload }
    });
  }

  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    const row = await this.prisma.creatorPaymentConfig.findUnique({
      where: { creatorId }
    });
    if (!row) {
      return null;
    }
    return row.payload as PaymentConfig;
  }

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
