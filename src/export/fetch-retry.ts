import type { ExportFetchRetryPolicy } from "./types.js";

export function shouldRetryHttpStatus(status: number): boolean {
  if (status === 429 || status === 408) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

export function isRetryableFetchError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error) {
    const n = e.name;
    if (n === "AbortError" || n === "TimeoutError") return true;
  }
  return false;
}

/**
 * Fetch URL with bounded retries (transient HTTP + network/timeout only).
 */
export async function fetchUpstreamWithRetries(
  url: string,
  fetchImpl: typeof fetch,
  policy: ExportFetchRetryPolicy,
  sleepFn: (ms: number) => Promise<void>
): Promise<Response> {
  let lastMessage = "Download failed";
  for (let attempt = 1; attempt <= policy.max_attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(policy.timeout_ms)
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
