/**
 * @fileoverview Structured HTTP auth errors (`RelayAuthError`) for account middleware.
 * @description Maps to API `errorEnvelope` with trace id for consistent JSON clients.
 * @see ../contracts/api.js
 */

import { errorEnvelope } from "../contracts/api.js";
import type { ApiError } from "../contracts/api.js";

/**
 * @description Structured auth failure for HTTP handlers (401/403 + API envelope).
 */
export class RelayAuthError extends Error {
  /**
   * @param {401 | 403} status
   * @param {string} code
   * @param {string} message
   */
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RelayAuthError";
  }

  /**
   * @param {string} traceId
   * @returns {import("../contracts/api.js").ApiError}
   */
  toEnvelope(traceId: string): ApiError {
    return errorEnvelope(this.code, this.message, traceId);
  }
}
