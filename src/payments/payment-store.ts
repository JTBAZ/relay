/**
 * @fileoverview File-backed `PaymentStore` implementation plus the store contract used by `PaymentService`.
 * @description JSON file at `RELAY_PAYMENT_STORE_PATH` (or configured path) holds configs and checkout history.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Parity: `CreatorPaymentConfig`, `PaymentCheckout` in `payment-store-db.ts`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CheckoutResult, PaymentConfig, PaymentStoreRoot } from "./types.js";

/**
 * Persistence port for payment configuration and checkout audit trail.
 * @todo Brittle: `FilePaymentStore.load` parses full JSON each call — hot paths may need caching.
 */
export interface PaymentStore {
  /**
   * @async
   * @throws {Error} Disk or JSON errors.
   */
  upsertConfig(config: PaymentConfig): Promise<void>;
  /**
   * @async
   * @throws {Error} Disk or JSON errors.
   */
  getConfig(creatorId: string): Promise<PaymentConfig | null>;
  /**
   * @async
   * @throws {Error} Disk or JSON errors.
   */
  appendCheckout(checkout: CheckoutResult): Promise<void>;
}

/** JSON file store for payment domain root document. */
export class FilePaymentStore implements PaymentStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Reads the full store file or returns an empty root when missing/invalid.
   * @async
   * @throws {Error} On unexpected read failures other than missing file.
   */
  public async load(): Promise<PaymentStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PaymentStoreRoot;
    } catch {
      return { configs: {}, checkouts: [] };
    }
  }

  /**
   * Atomically replaces the JSON file with `root`.
   * @async
   * @throws {Error} Disk write errors.
   */
  public async save(root: PaymentStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  /**
   * @async
   * @throws {Error} Via `load` / `save`.
   */
  public async upsertConfig(config: PaymentConfig): Promise<void> {
    const root = await this.load();
    root.configs[config.creator_id] = config;
    await this.save(root);
  }

  /**
   * @async
   * @throws {Error} Via `load` / `save`.
   */
  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    const root = await this.load();
    return root.configs[creatorId] ?? null;
  }

  /**
   * @async
   * @throws {Error} Via `load` / `save`.
   */
  public async appendCheckout(checkout: CheckoutResult): Promise<void> {
    const root = await this.load();
    root.checkouts.push(checkout);
    await this.save(root);
  }
}
