/**
 * Patreon OAuth token HTTP client (EH-040).
 * Authorization-code exchange + refresh via injectable fetch.
 * Server-only — never import from client components.
 */

export type PatreonTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

export const DEFAULT_PATREON_TOKEN_URL =
  "https://www.patreon.com/api/oauth2/token";

export const DEFAULT_PATREON_AUTHORIZE_URL =
  "https://www.patreon.com/oauth2/authorize";

type PatreonClientConfig = {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
};

export class PatreonOAuthError extends Error {
  readonly code = "ESCAPE_HATCH_PATREON_OAUTH";
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PatreonOAuthError";
    this.status = status;
  }
}

/**
 * Stateless wrapper for Patreon OAuth token HTTP calls.
 * Errors never include client_secret or token plaintext.
 */
export class PatreonClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PatreonClientConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenUrl = config.tokenUrl ?? DEFAULT_PATREON_TOKEN_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<PatreonTokenResponse> {
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    };
    if (codeVerifier) {
      params.code_verifier = codeVerifier;
    }
    return this.requestToken(params);
  }

  async refreshToken(refreshToken: string): Promise<PatreonTokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
  }

  private async requestToken(
    params: Record<string, string>
  ): Promise<PatreonTokenResponse> {
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
      // Do not include response body — may echo secrets.
      throw new PatreonOAuthError(
        `Patreon token request failed with status ${response.status}`,
        response.status
      );
    }

    const json = (await response.json()) as Partial<PatreonTokenResponse>;
    if (
      typeof json.access_token !== "string" ||
      typeof json.refresh_token !== "string" ||
      typeof json.expires_in !== "number"
    ) {
      throw new PatreonOAuthError("Patreon token response missing required fields");
    }
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      token_type: json.token_type,
      scope: json.scope
    };
  }
}
