import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CheckoutResult, PaymentConfig, PaymentStoreRoot } from "./types.js";

export class FilePaymentStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<PaymentStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PaymentStoreRoot;
    } catch {
      return { configs: {}, checkouts: [] };
    }
  }

  public async save(root: PaymentStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async upsertConfig(config: PaymentConfig): Promise<void> {
    const root = await this.load();
    root.configs[config.creator_id] = config;
    await this.save(root);
  }

  public async getConfig(creatorId: string): Promise<PaymentConfig | null> {
    const root = await this.load();
    return root.configs[creatorId] ?? null;
  }

  public async appendCheckout(checkout: CheckoutResult): Promise<void> {
    const root = await this.load();
    root.checkouts.push(checkout);
    await this.save(root);
  }
}
