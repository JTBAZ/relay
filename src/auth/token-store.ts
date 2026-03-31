import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TokenEncryption } from "../lib/crypto.js";

export type CredentialHealthStatus = "healthy" | "refresh_failed";

export type PatreonTokenRecord = {
  creator_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  provider_user_id?: string;
  credential_health_status: CredentialHealthStatus;
  updated_at: string;
};

type TokenStoreData = {
  records: Record<string, PatreonTokenRecord>;
};

export type PersistedPatreonTokens = {
  creator_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  provider_user_id?: string;
  credential_health_status: CredentialHealthStatus;
};

export class FilePatreonTokenStore {
  private readonly filePath: string;
  private readonly tokenEncryption: TokenEncryption;

  public constructor(filePath: string, tokenEncryption: TokenEncryption) {
    this.filePath = filePath;
    this.tokenEncryption = tokenEncryption;
  }

  public async upsert(tokens: PersistedPatreonTokens): Promise<void> {
    const data = await this.readStore();
    data.records[tokens.creator_id] = {
      creator_id: tokens.creator_id,
      encrypted_access_token: this.tokenEncryption.encrypt(tokens.access_token),
      encrypted_refresh_token: this.tokenEncryption.encrypt(tokens.refresh_token),
      access_token_expires_at: tokens.access_token_expires_at,
      provider_user_id: tokens.provider_user_id,
      credential_health_status: tokens.credential_health_status,
      updated_at: new Date().toISOString()
    };
    await this.writeStore(data);
  }

  public async getByCreatorId(creatorId: string): Promise<PersistedPatreonTokens | null> {
    const data = await this.readStore();
    const record = data.records[creatorId];
    if (!record) {
      return null;
    }

    return {
      creator_id: record.creator_id,
      access_token: this.tokenEncryption.decrypt(record.encrypted_access_token),
      refresh_token: this.tokenEncryption.decrypt(record.encrypted_refresh_token),
      access_token_expires_at: record.access_token_expires_at,
      provider_user_id: record.provider_user_id,
      credential_health_status: record.credential_health_status
    };
  }

  private async readStore(): Promise<TokenStoreData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as TokenStoreData;
    } catch {
      return { records: {} };
    }
  }

  private async writeStore(data: TokenStoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
