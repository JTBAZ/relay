import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TokenEncryption } from "../lib/crypto.js";

export type PatreonCookieRecord = {
  creator_id: string;
  encrypted_session_id: string;
  stored_at: string;
};

type CookieStoreData = {
  records: Record<string, PatreonCookieRecord>;
};

export class FilePatreonCookieStore {
  private readonly filePath: string;
  private readonly encryption: TokenEncryption;

  public constructor(filePath: string, encryption: TokenEncryption) {
    this.filePath = filePath;
    this.encryption = encryption;
  }

  public async upsert(creatorId: string, sessionId: string): Promise<void> {
    const data = await this.readStore();
    data.records[creatorId] = {
      creator_id: creatorId,
      encrypted_session_id: this.encryption.encrypt(sessionId),
      stored_at: new Date().toISOString()
    };
    await this.writeStore(data);
  }

  public async getSessionId(creatorId: string): Promise<string | null> {
    const data = await this.readStore();
    const record = data.records[creatorId];
    if (!record) return null;
    return this.encryption.decrypt(record.encrypted_session_id);
  }

  public async remove(creatorId: string): Promise<boolean> {
    const data = await this.readStore();
    if (!data.records[creatorId]) return false;
    delete data.records[creatorId];
    await this.writeStore(data);
    return true;
  }

  private async readStore(): Promise<CookieStoreData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CookieStoreData;
    } catch {
      return { records: {} };
    }
  }

  private async writeStore(data: CookieStoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
