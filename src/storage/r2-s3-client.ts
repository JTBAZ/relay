import { S3Client } from "@aws-sdk/client-s3";
import type { R2ClientConfig } from "./r2-config.js";

export function createR2S3Client(cfg: R2ClientConfig): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: cfg.credentials
  });
}
