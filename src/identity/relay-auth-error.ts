import { errorEnvelope } from "../contracts/api.js";
import type { ApiError } from "../contracts/api.js";

/**
 * Structured auth failure for `requireAccount` / `requireAccountWithRole`.
 */
export class RelayAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RelayAuthError";
  }

  toEnvelope(traceId: string): ApiError {
    return errorEnvelope(this.code, this.message, traceId);
  }
}
