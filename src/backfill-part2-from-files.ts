import type { PrismaClient } from "@prisma/client";
import { DbCloneSiteStore } from "./clone/clone-store-db.js";
import { FileCloneSiteStore } from "./clone/clone-store.js";
import { DbDeployStore } from "./deploy/deploy-store-db.js";
import { FileDeployStore } from "./deploy/deploy-store.js";
import { DbMigrationStore } from "./migrate/migration-store-db.js";
import { FileMigrationStore } from "./migrate/migration-store.js";
import { DbPaymentStore } from "./payments/payment-store-db.js";
import { FilePaymentStore } from "./payments/payment-store.js";

/**
 * One-shot migration from Part 2 JSON files into Postgres.
 * Re-running may duplicate `migration_audit_entries` rows (append-only); other tables are upserted.
 */
export async function backfillPart2FromFiles(args: {
  prisma: PrismaClient;
  clonePath: string;
  paymentsPath: string;
  migrationsPath: string;
  deploysPath: string;
}): Promise<{
  cloneSites: number;
  paymentConfigs: number;
  paymentCheckouts: number;
  migrationCampaigns: number;
  migrationAuditEntries: number;
  suppressionEmails: number;
  signedLinks: number;
  deployments: number;
  activeDeployments: number;
}> {
  const cloneFile = new FileCloneSiteStore(args.clonePath);
  const payFile = new FilePaymentStore(args.paymentsPath);
  const migFile = new FileMigrationStore(args.migrationsPath);
  const depFile = new FileDeployStore(args.deploysPath);

  const dbClone = new DbCloneSiteStore(args.prisma);
  const dbPay = new DbPaymentStore(args.prisma);
  const dbMig = new DbMigrationStore(args.prisma);
  const dbDep = new DbDeployStore(args.prisma);

  const cloneRoot = await cloneFile.load();
  let cloneSites = 0;
  for (const model of Object.values(cloneRoot.sites)) {
    await dbClone.upsert(model);
    cloneSites += 1;
  }

  const payRoot = await payFile.load();
  let paymentConfigs = 0;
  for (const cfg of Object.values(payRoot.configs)) {
    await dbPay.upsertConfig(cfg);
    paymentConfigs += 1;
  }
  let paymentCheckouts = 0;
  for (const co of payRoot.checkouts) {
    await args.prisma.paymentCheckout.upsert({
      where: { checkoutId: co.checkout_id },
      create: {
        checkoutId: co.checkout_id,
        tierId: co.tier_id,
        provider: co.provider,
        status: co.status,
        amountCents: co.amount_cents,
        currency: co.currency,
        dryRun: co.dry_run,
        processedAt: new Date(co.processed_at),
        errorMessage: co.error_message ?? null
      },
      update: {
        tierId: co.tier_id,
        provider: co.provider,
        status: co.status,
        amountCents: co.amount_cents,
        currency: co.currency,
        dryRun: co.dry_run,
        processedAt: new Date(co.processed_at),
        errorMessage: co.error_message ?? null
      }
    });
    paymentCheckouts += 1;
  }

  const migRoot = await migFile.load();
  let migrationCampaigns = 0;
  for (const c of Object.values(migRoot.campaigns)) {
    await dbMig.upsertCampaign(c);
    migrationCampaigns += 1;
  }
  let migrationAuditEntries = 0;
  for (const e of migRoot.audit_log) {
    await dbMig.appendAudit(e);
    migrationAuditEntries += 1;
  }
  let suppressionEmails = 0;
  for (const [creatorId, emails] of Object.entries(migRoot.suppression_list)) {
    if (emails.length === 0) {
      continue;
    }
    await dbMig.addToSuppression(creatorId, emails);
    suppressionEmails += emails.length;
  }
  let signedLinks = 0;
  for (const link of Object.values(migRoot.signed_links)) {
    await dbMig.storeSignedLink(link);
    signedLinks += 1;
  }

  const depRoot = await depFile.load();
  let deployments = 0;
  for (const d of Object.values(depRoot.deployments)) {
    await dbDep.upsert(d);
    deployments += 1;
  }
  let activeDeployments = 0;
  for (const [creatorId, deploymentId] of Object.entries(depRoot.active_by_creator)) {
    await dbDep.setActive(creatorId, deploymentId);
    activeDeployments += 1;
  }

  return {
    cloneSites,
    paymentConfigs,
    paymentCheckouts,
    migrationCampaigns,
    migrationAuditEntries,
    suppressionEmails,
    signedLinks,
    deployments,
    activeDeployments
  };
}
