/**
 * Deterministic in-memory ObjectStoragePort for package tests and default CLI.
 * Never requires live Cloudflare R2 credentials.
 *
 * Fully proves the private-read contract: authenticated get succeeds and
 * anonymous/public-path APIs always deny private keys.
 */

import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  guardPrivateReadKey,
  type HeadObjectResult,
  type ObjectStoragePort,
  type PrivateReadResult,
  type PutObjectMeta
} from "./storage-port.js";
import { isPublicMediaPath } from "./validate.js";

type StoredObject = {
  body: Buffer;
  contentType?: string;
  /** Objects written through this port are private; public URL access is always denied. */
  private: true;
};

async function readStreamToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type MemoryObjectStorageOptions = {
  /**
   * When set, putObject* fails for the first `failNextPuts` calls (resume tests).
   */
  failNextPuts?: number;
  failPutMessage?: string;
};

export class MemoryObjectStorage implements ObjectStoragePort {
  private readonly objects = new Map<string, StoredObject>();
  private failNextPuts: number;
  private readonly failPutMessage: string;

  constructor(opts: MemoryObjectStorageOptions = {}) {
    this.failNextPuts = opts.failNextPuts ?? 0;
    this.failPutMessage = opts.failPutMessage ?? "simulated storage put failure";
  }

  /** Test helper: remaining intentional put failures. */
  get remainingPutFailures(): number {
    return this.failNextPuts;
  }

  setFailNextPuts(n: number): void {
    this.failNextPuts = n;
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  clear(): void {
    this.objects.clear();
  }

  private maybeFailPut(): void {
    if (this.failNextPuts > 0) {
      this.failNextPuts -= 1;
      throw new Error(this.failPutMessage);
    }
  }

  async putObjectStream(
    key: string,
    body: Readable,
    meta?: PutObjectMeta
  ): Promise<void> {
    guardPrivateReadKey(key);
    this.maybeFailPut();
    const buf = await readStreamToBuffer(body);
    if (
      meta?.contentLength !== undefined &&
      meta.contentLength !== buf.length
    ) {
      throw new Error("content length mismatch on put stream");
    }
    this.objects.set(key, {
      body: buf,
      contentType: meta?.contentType,
      private: true
    });
  }

  async putObjectBuffer(
    key: string,
    body: Buffer,
    meta?: PutObjectMeta
  ): Promise<void> {
    guardPrivateReadKey(key);
    this.maybeFailPut();
    this.objects.set(key, {
      body: Buffer.from(body),
      contentType: meta?.contentType,
      private: true
    });
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    guardPrivateReadKey(key);
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      contentLength: obj.body.length,
      contentType: obj.contentType
    };
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    guardPrivateReadKey(key);
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`object not found: ${key}`);
    }
    return Buffer.from(obj.body);
  }

  async deleteObject(key: string): Promise<void> {
    guardPrivateReadKey(key);
    this.objects.delete(key);
  }

  /**
   * Public/anonymous path API — always denies private object keys.
   * Used by assertPrivateRead to prove privacy beyond authenticated GET.
   */
  async anonymousGet(key: string): Promise<Buffer> {
    if (isPublicMediaPath(key)) {
      throw new Error("anonymous get refused: public/media is not private storage");
    }
    // Memory adapter never exposes private objects via any public-path API.
    throw new Error(`anonymous/public read denied for key: ${key}`);
  }

  /**
   * Explicitly documents that anonymous/public URL access is never success.
   * Always returns false for memory adapter (no public URLs).
   */
  isAnonymouslyReadable(_key: string): boolean {
    return false;
  }

  async assertPrivateRead(key: string): Promise<PrivateReadResult> {
    guardPrivateReadKey(key);
    const obj = this.objects.get(key);
    if (!obj || !obj.private) {
      throw new Error("private read failed: object not privately stored");
    }

    // Authenticated path succeeds (obj present). Anonymous path must fail.
    let anonymousSucceeded = false;
    try {
      await this.anonymousGet(key);
      anonymousSucceeded = true;
    } catch {
      // Expected — private objects are not anonymously readable.
    }
    if (anonymousSucceeded) {
      throw new Error(
        "private read failed: anonymous/public read unexpectedly succeeded"
      );
    }
    if (this.isAnonymouslyReadable(key)) {
      throw new Error(
        "private read failed: object reported as anonymously readable"
      );
    }

    const sha256 = createHash("sha256").update(obj.body).digest("hex");
    return {
      byteLength: obj.body.length,
      sha256,
      anonymous_denied: true
    };
  }
}
