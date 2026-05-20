-- CreateTable
CREATE TABLE "patron_subscribestar_oauth_credentials" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "encrypted_payload" BYTEA NOT NULL,
    "key_id" TEXT NOT NULL,
    "health_status" "CredentialHealth" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_subscribestar_oauth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patron_subscribestar_oauth_credentials_account_id_key" ON "patron_subscribestar_oauth_credentials"("account_id");

-- AddForeignKey
ALTER TABLE "patron_subscribestar_oauth_credentials" ADD CONSTRAINT "patron_subscribestar_oauth_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
