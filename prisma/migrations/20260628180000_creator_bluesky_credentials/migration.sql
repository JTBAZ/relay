-- WI-8 — Bluesky app password storage for Autopost distribute.

CREATE TABLE "creator_bluesky_credentials" (
    "creator_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "encrypted_app_password" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_bluesky_credentials_pkey" PRIMARY KEY ("creator_id")
);
