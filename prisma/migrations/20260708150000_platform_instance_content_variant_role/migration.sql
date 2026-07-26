-- Per-destination analytics role on platform instances (e.g. promo when preview media was posted to X).
ALTER TABLE "platform_instances" ADD COLUMN "content_variant_role" "CreativeWorkVariantRole";
