-- DropIndex
DROP INDEX "webhook_endpoints_relay_creator_id_idx";

-- RenameIndex
ALTER INDEX "patron_campaign_access_tenant_membership_id_relay_creator_id_ca" RENAME TO "patron_campaign_access_tenant_membership_id_relay_creator_i_key";
