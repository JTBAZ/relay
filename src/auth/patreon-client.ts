/**
 * @fileoverview Minimal Patreon OAuth token HTTP client (authorization_code + refresh_token grants).
 * @description Posts `application/x-www-form-urlencoded` bodies to Patreon's token endpoint via injectable `fetch`.
 * @see Patreon OAuth documentation ({@link https://docs.patreon.com/})
 */
import { patreonOAuthRequest } from "../patreon/oauth-request.js";

/** @description Parsed token response envelope from Patreon's OAuth token endpoint. */
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

/**
 * @description Stateless wrapper for Patreon OAuth token HTTP calls.
 * @security-audit-required Embeds `client_secret` in request bodies; keep instances server-side only.
 */
export class PatreonClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  /**
   * @description Binds client credentials and token URL.
   * @param config OAuth client id/secret, token URL, optional `fetch`.
   */
  public constructor(config: PatreonClientConfig) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.tokenUrl = config.token_url;
    this.fetchImpl = config.fetch_impl ?? fetch;
  }

  /**
   * @description Exchange authorization code for tokens.
   * @param code Authorization code from Patreon redirect.
   * @param redirectUri Must match registered redirect URI.
   * @returns Token response JSON.
   * @async
   * @throws {Error} Non-OK HTTP status or JSON parse failures from Patreon.
   */
  public async exchangeCode(code: string, redirectUri: string): Promise<PatreonTokenResponse> {
    return this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
  }

  /**
   * @description Refresh using a refresh token.
   * @param refreshToken Refresh token from prior exchange/refresh.
   * @returns Rotated token response JSON.
   * @async
   * @throws {Error} Non-OK HTTP status or malformed JSON from Patreon.
   */
  public async refreshToken(refreshToken: string): Promise<PatreonTokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
  }

  /**
   * @description Internal POST to Patreon token URL with form body.
   * @param params OAuth grant parameters merged with client credentials.
   * @returns Parsed `PatreonTokenResponse`.
   * @async
   * @throws {Error} HTTP errors from Patreon (`response.ok` false).
   */
  private async requestToken(params: Record<string, string>): Promise<PatreonTokenResponse> {
    const form = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...params
    });

    const response = await patreonOAuthRequest(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Relay - Patreon Sync" },
      body: form.toString()
    }, this.fetchImpl) as PatreonTokenResponse;
    if (!response || typeof response.access_token !== "string" || !response.access_token.trim() ||
      typeof response.refresh_token !== "string" || !response.refresh_token.trim() ||
      typeof response.expires_in !== "number" || !Number.isFinite(response.expires_in) || response.expires_in <= 0 ||
      !Number.isFinite(new Date(Date.now() + response.expires_in * 1000).getTime())) {
      throw new Error("Patreon returned an invalid token response.");
    }
    return response;
  }
}
