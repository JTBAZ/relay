export type PatreonTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

type PatreonClientConfig = {
  client_id: string;
  client_secret: string;
  token_url: string;
  fetch_impl?: typeof fetch;
};

export class PatreonClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(config: PatreonClientConfig) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.tokenUrl = config.token_url;
    this.fetchImpl = config.fetch_impl ?? fetch;
  }

  public async exchangeCode(code: string, redirectUri: string): Promise<PatreonTokenResponse> {
    return this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
  }

  public async refreshToken(refreshToken: string): Promise<PatreonTokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
  }

  private async requestToken(params: Record<string, string>): Promise<PatreonTokenResponse> {
    const form = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...params
    });

    const response = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    if (!response.ok) {
      throw new Error(`Patreon token request failed with status ${response.status}`);
    }

    return (await response.json()) as PatreonTokenResponse;
  }
}
