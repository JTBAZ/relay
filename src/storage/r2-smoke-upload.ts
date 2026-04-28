import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { R2ClientConfig } from "./r2-config.js";
import { getR2ClientConfigFromEnv } from "./r2-config.js";
import { createR2S3Client } from "./r2-s3-client.js";

/**
 * PUT a tiny object then DELETE it — verifies bucket credentials and API reachability.
 * Object key: `relay-smoke/<iso-timestamp>.txt`
 */
export async function r2UploadSmokeTest(
  cfg: R2ClientConfig | null = getR2ClientConfigFromEnv()
): Promise<{ bucket: string; key: string; endpoint: string }> {
  if (!cfg) {
    throw new Error(
      "R2 env incomplete: set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_ACCOUNT_ID (or R2_ENDPOINT). See .env.example."
    );
  }

  const client = createR2S3Client(cfg);
  const key = `relay-smoke/${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  const body = `relay r2 smoke ${new Date().toISOString()}\n`;

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: Buffer.from(body, "utf8"),
      ContentType: "text/plain"
    })
  );

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key
      })
    );
  } catch {
    /* cleanup is best-effort; PUT already proved access */
  }

  return { bucket: cfg.bucket, key, endpoint: cfg.endpoint };
}
