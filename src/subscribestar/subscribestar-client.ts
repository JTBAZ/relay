/**
 * SubscribeStar OAuth2 token client (`authorization_code` + `refresh_token`).
 * Mirrors `PatreonClient` — POST `application/x-www-form-urlencoded` to the token endpoint.
 * @security-audit-required Server-side only; never expose `client_secret` to browsers.
 */

export type SubscribeStarTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

type SubscribeStarOAuthClientConfig = {
  client_id: string;
  client_secret: string;
  token_url: string;
  fetch_impl?: typeof fetch;
};

export class SubscribeStarOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(config: SubscribeStarOAuthClientConfig) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.tokenUrl = config.token_url;
    this.fetchImpl = config.fetch_impl ?? fetch;
  }

  public async exchangeCode(code: string, redirectUri: string): Promise<SubscribeStarTokenResponse> {
    return this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
  }

  public async refreshToken(refreshToken: string): Promise<SubscribeStarTokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
  }

  private async requestToken(params: Record<string, string>): Promise<SubscribeStarTokenResponse> {
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
      const body = await response.text().catch(() => "");
      throw new Error(
        `SubscribeStar token request failed with status ${response.status}` +
          (body ? `: ${body.slice(0, 400)}` : "")
      );
    }

    return (await response.json()) as SubscribeStarTokenResponse;
  }
}
