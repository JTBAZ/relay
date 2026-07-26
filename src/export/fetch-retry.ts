/**
 * @fileoverview Bounded HTTP fetch helper for Patreon/upstream media export with exponential backoff.
 * @description Classifies retryable status codes and transient network errors for `ExportService`.
 */

import type { ExportFetchRetryPolicy } from "./types.js";

/**
 * @description Returns whether an HTTP status warrants another attempt.
 * @param status HTTP status code.
 */
export function shouldRetryHttpStatus(status: number): boolean {
  if (status === 429 || status === 408) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/**
 * @description Heuristic for network-layer failures that may succeed on retry.
 * @param e Unknown thrown error.
 */
export function isRetryableFetchError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error) {
    const n = e.name;
    if (n === "AbortError" || n === "TimeoutError") return true;
  }
  return false;
}

/** @description Optional headers merged into each upstream attempt (e.g. Patreon Bearer). */
export type FetchUpstreamOptions = {
  /** Merged into each attempt (e.g. `Authorization` for Patreon-hosted media). */
  headers?: Record<string, string>;
};

/**
 * Fetch URL with bounded retries (transient HTTP + network/timeout only).
 * @description Applies `AbortSignal.timeout`, exponential delays via `sleepFn`, and throws when exhausted.
 * @param url Upstream URL.
 * @param fetchImpl Injectable `fetch`.
 * @param policy Attempt/timeout limits.
 * @param sleepFn Delay between attempts.
 * @param options Optional outgoing headers.
 * @returns Final `Response` when `ok`.
 * @async
 * @throws {Error} Non-retryable HTTP status, network errors after retries, or timeout failures.
 */
export async function fetchUpstreamWithRetries(
  url: string,
  fetchImpl: typeof fetch,
  policy: ExportFetchRetryPolicy,
  sleepFn: (ms: number) => Promise<void>,
  options?: FetchUpstreamOptions
): Promise<Response> {
  const headers = options?.headers;
  let lastMessage = "Download failed";
  for (let attempt = 1; attempt <= policy.max_attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(policy.timeout_ms),
        ...(headers && Object.keys(headers).length > 0 ? { headers } : {})
      });
      if (response.ok) {
        return response;
      }
      lastMessage = `Download failed with status ${response.status}`;
      const canRetry = shouldRetryHttpStatus(response.status) && attempt < policy.max_attempts;
      if (!canRetry) {
        throw new Error(lastMessage);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Download failed with status")) {
        throw e;
      }
      lastMessage = e instanceof Error ? e.message : String(e);
      const canRetry = isRetryableFetchError(e) && attempt < policy.max_attempts;
      if (!canRetry) {
        throw e instanceof Error ? e : new Error(lastMessage);
      }
    }
    const delay = policy.base_delay_ms * Math.pow(2, attempt - 1);
    await sleepFn(delay);
  }
  throw new Error(lastMessage);
}
