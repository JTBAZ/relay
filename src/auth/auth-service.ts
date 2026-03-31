import { InMemoryEventBus } from "../events/event-bus.js";
import { PatreonClient } from "./patreon-client.js";
import { FilePatreonTokenStore } from "./token-store.js";

function addSecondsToNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export class PatreonAuthService {
  private readonly patreonClient: PatreonClient;
  private readonly tokenStore: FilePatreonTokenStore;
  private readonly eventBus: InMemoryEventBus;

  public constructor(
    patreonClient: PatreonClient,
    tokenStore: FilePatreonTokenStore,
    eventBus: InMemoryEventBus
  ) {
    this.patreonClient = patreonClient;
    this.tokenStore = tokenStore;
    this.eventBus = eventBus;
  }

  public async exchangeCodeAndPersist(
    creatorId: string,
    code: string,
    redirectUri: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy" }> {
    const tokenResponse = await this.patreonClient.exchangeCode(code, redirectUri);

    await this.tokenStore.upsert({
      creator_id: creatorId,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      access_token_expires_at: addSecondsToNow(tokenResponse.expires_in),
      credential_health_status: "healthy"
    });

    this.eventBus.publish("patreon_oauth_connected", creatorId, traceId, {
      primary_id: creatorId,
      creator_id: creatorId,
      credential_health_status: "healthy"
    });

    return {
      creator_id: creatorId,
      credential_health_status: "healthy"
    };
  }

  public async refreshAndRotate(
    creatorId: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy" }> {
    const current = await this.tokenStore.getByCreatorId(creatorId);
    if (!current) {
      throw new Error("Creator credentials not found.");
    }

    const refreshed = await this.patreonClient.refreshToken(current.refresh_token);
    await this.tokenStore.upsert({
      creator_id: creatorId,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      access_token_expires_at: addSecondsToNow(refreshed.expires_in),
      credential_health_status: "healthy"
    });

    this.eventBus.publish("patreon_token_refreshed", creatorId, traceId, {
      primary_id: creatorId,
      creator_id: creatorId,
      credential_health_status: "healthy"
    });

    return {
      creator_id: creatorId,
      credential_health_status: "healthy"
    };
  }
}
