/**
 * Optional S3-compatible R2 adapter for EH-012.
 *
 * Constructed only when config is injected. Package tests never require live R2.
 * Credentials must never be logged or written into migration ledgers.
 *
 * Honesty: authenticated GetObject alone does NOT set private_read_verified.
 * Claiming private_read_verified requires an explicit anonymous probe against an
 * operator-configured publicBaseUrl (allowPublicProbe). Without that probe,
 * assertPrivateRead fails closed.
 */

import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import {
  guardPrivateReadKey,
  type HeadObjectResult,
  type ObjectStoragePort,
  type PrivateReadResult,
  type PutObjectMeta
} from "./storage-port.js";

/** Injected R2/S3 client parameters — never log this object. */
export type R2StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /**
   * Operator public base URL for this bucket only (e.g. https://pub-….r2.dev).
   * Required with allowPublicProbe to claim private_read_verified.
   * Fetches are restricted to this origin — never arbitrary URLs (SSRF guard).
   */
  publicBaseUrl?: string;
  /**
   * When true with publicBaseUrl, assertPrivateRead probes anonymous GET and
   * requires 401/403/404. Without this, assertPrivateRead fails closed.
   */
  allowPublicProbe?: boolean;
};

export type R2ObjectStorageOptions = {
  /** Injected fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof globalThis.fetch;
};

function createClient(cfg: R2StorageConfig): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.credentials.accessKeyId,
      secretAccessKey: cfg.credentials.secretAccessKey
    },
    forcePathStyle: true
  });
}

async function streamToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Build a public object URL under an operator-configured base only.
 * Rejects bases that are not https and encodes each key segment (no open redirect).
 */
export function buildR2PublicObjectUrl(publicBaseUrl: string, key: string): string {
  const trimmed = publicBaseUrl.trim().replace(/\/+$/, "");
  let base: URL;
  try {
    base = new URL(trimmed);
  } catch {
    throw new Error("invalid R2 publicBaseUrl");
  }
  if (base.protocol !== "https:") {
    throw new Error("R2 publicBaseUrl must use https");
  }
  if (base.username || base.password) {
    throw new Error("R2 publicBaseUrl must not include credentials");
  }
  const encodedKey = key
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
  const url = new URL(encodedKey, `${base.origin}${base.pathname.replace(/\/+$/, "")}/`);
  if (url.origin !== base.origin) {
    throw new Error("R2 public object URL escaped configured origin");
  }
  return url.toString();
}

/**
 * Fail closed unless anonymous probe is explicitly enabled for this adapter.
 */
export function assertR2PrivateReadProbeConfigured(
  cfg: Pick<R2StorageConfig, "publicBaseUrl" | "allowPublicProbe">
): void {
  if (!cfg.allowPublicProbe) {
    throw new Error(
      "private_read_verified cannot be claimed for R2 without allowPublicProbe (authenticated GET alone is insufficient)"
    );
  }
  if (!cfg.publicBaseUrl?.trim()) {
    throw new Error(
      "private_read_verified cannot be claimed for R2 without publicBaseUrl for anonymous probe"
    );
  }
}

/**
 * Live R2 adapter. Only instantiate when caller injects config (CLI opt-in).
 * Default migrate-media path uses MemoryObjectStorage.
 */
export class R2ObjectStorage implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | undefined;
  private readonly allowPublicProbe: boolean;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(cfg: R2StorageConfig, opts: R2ObjectStorageOptions = {}) {
    if (!cfg.endpoint || !cfg.bucket || !cfg.credentials?.accessKeyId) {
      throw new Error("incomplete R2 storage config");
    }
    if (!cfg.credentials.secretAccessKey) {
      throw new Error("incomplete R2 storage config");
    }
    this.client = createClient(cfg);
    this.bucket = cfg.bucket;
    this.publicBaseUrl = cfg.publicBaseUrl?.trim() || undefined;
    this.allowPublicProbe = cfg.allowPublicProbe === true;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async putObjectStream(
    key: string,
    body: Readable,
    meta?: PutObjectMeta
  ): Promise<void> {
    guardPrivateReadKey(key);
    // Stream is buffered only at the AWS SDK boundary for PutObject Body typing;
    // callers still open a file stream rather than preloading arbitrary remote URLs.
    const buf = await streamToBuffer(body);
    await this.putObjectBuffer(key, buf, meta);
  }

  async putObjectBuffer(
    key: string,
    body: Buffer,
    meta?: PutObjectMeta
  ): Promise<void> {
    guardPrivateReadKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: meta?.contentType,
        ContentLength: body.length
      })
    );
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    guardPrivateReadKey(key);
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        contentLength: out.ContentLength ?? 0,
        contentType: out.ContentType
      };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NotFound" || name === "NoSuchKey") return null;
      throw err;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    guardPrivateReadKey(key);
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!out.Body) {
      throw new Error("R2 object has no body");
    }
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    guardPrivateReadKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async assertPrivateRead(key: string): Promise<PrivateReadResult> {
    guardPrivateReadKey(key);
    // Fail closed before any network when probe is not configured — auth GET
    // alone must never claim private_read_verified.
    assertR2PrivateReadProbeConfigured({
      allowPublicProbe: this.allowPublicProbe,
      publicBaseUrl: this.publicBaseUrl
    });

    const body = await this.getObjectBuffer(key);
    const sha256 = createHash("sha256").update(body).digest("hex");

    const publicUrl = buildR2PublicObjectUrl(this.publicBaseUrl!, key);
    const res = await this.fetchImpl(publicUrl, {
      method: "GET",
      redirect: "manual"
    });

    // World-readable object fails closed.
    if (res.status === 200) {
      throw new Error(
        "private read failed: object is anonymously reachable (world-readable)"
      );
    }
    // Accept only clear denial statuses from anonymous GET.
    if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
      throw new Error(
        `private read failed: unexpected anonymous probe status ${res.status}`
      );
    }

    return {
      byteLength: body.length,
      sha256,
      anonymous_denied: true
    };
  }
}

/**
 * Build R2 config from explicit fields only (no ambient env reads inside adapter).
 * Callers may optionally source from env; package tests never do.
 */
export function createR2StorageConfig(input: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  publicBaseUrl?: string;
  allowPublicProbe?: boolean;
}): R2StorageConfig {
  return {
    endpoint: input.endpoint,
    bucket: input.bucket,
    region: input.region ?? "auto",
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    },
    publicBaseUrl: input.publicBaseUrl,
    allowPublicProbe: input.allowPublicProbe
  };
}
