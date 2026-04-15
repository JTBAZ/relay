-- MT-031: Bind at most one creator `relay_creator_id` per Account (artist workspace scope).
-- Existing rows keep NULL until workspace provisioning (MT-032).

ALTER TABLE "accounts" ADD COLUMN "primary_relay_creator_id" TEXT;

CREATE UNIQUE INDEX "accounts_primary_relay_creator_id_key" ON "accounts"("primary_relay_creator_id");

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_primary_relay_creator_id_fkey"
  FOREIGN KEY ("primary_relay_creator_id") REFERENCES "tenants"("relay_creator_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
