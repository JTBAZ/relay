const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Safe to record in sync health: provider bodies and bearer credentials are never included. */
export class PatreonRequestError extends Error {
  public constructor(message: string, public readonly retriable: boolean, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(message);
  }
}

/** Bound headers and body together. Token POSTs only retry explicit throttling, never an ambiguous rotation. */
export async function patreonOAuthRequest(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const deadline = Date.now() + 35_000;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response;
    let body: string;
    try {
      [response, body] = await Promise.race([
        (async (): Promise<[Response, string]> => {
          const res = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
          return [res, await res.text()];
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, Math.max(1, Math.min(10_000, deadline - Date.now())));
        })
      ]);
    } catch {
      if (init.method === "POST" || attempt >= 2 || Date.now() >= deadline) throw new PatreonRequestError("Patreon request interrupted; retry required.", true);
      await delay(250 * 2 ** attempt);
      continue;
    } finally { clearTimeout(timer); }
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { /* HTTP status still determines retry eligibility. */ }
    if (response.ok) {
      if (parsed === undefined) throw new PatreonRequestError("Patreon returned invalid JSON.", true);
      return parsed;
    }
    const retriable = response.status === 429 || response.status >= 500;
    const header = response.headers.get("retry-after");
    const headerMs = header === null ? 0 : Number.isFinite(Number(header)) ? Math.max(0, Number(header) * 1000) : Math.max(0, Date.parse(header) - Date.now());
    const errors = (parsed as { errors?: Array<{ retry_after_seconds?: unknown }> } | undefined)?.errors;
    const providerMs = Array.isArray(errors) ? Math.max(0, ...errors.map((e) => typeof e?.retry_after_seconds === "number" && Number.isFinite(e.retry_after_seconds) ? Math.max(0, e.retry_after_seconds * 1000) : 0)) : 0;
    const retryAfterMs = Math.max(Number.isFinite(headerMs) ? headerMs : 0, providerMs, 250 * 2 ** attempt);
    if (!retriable || attempt >= 2 || (init.method === "POST" && response.status !== 429) || retryAfterMs > 5000 || Date.now() + retryAfterMs >= deadline) {
      throw new PatreonRequestError(`Patreon API ${response.status}; ${retriable ? `retry required after ${Math.ceil(retryAfterMs / 1000)} seconds` : "request rejected"}.`, retriable, response.status, retriable ? retryAfterMs : undefined);
    }
    await delay(retryAfterMs);
  }
}
