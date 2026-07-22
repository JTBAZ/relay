/**
 * Local-prototype operator gate for library-truth mutations (EH-013).
 *
 * Not authentication. Shared-preview hosts must reject exclude/complete unless
 * an explicit local override is set.
 */

export const LOCAL_OPERATOR_HEADER = "x-escape-hatch-local" as const;
export const LOCAL_OPERATOR_HEADER_VALUE = "1" as const;
export const LOCAL_OPERATOR_ALLOW_ENV = "ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW" as const;

export type LocalOperatorDecision =
  | { allowed: true; reason: "localhost" | "explicit_allow" }
  | { allowed: false; status: 403; error: string };

function hostnameFromHostHeader(host: string | null): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end > 0) return trimmed.slice(1, end);
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon > 0 && !trimmed.includes("]")) {
    return trimmed.slice(0, colon);
  }
  return trimmed;
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

/**
 * Fail-closed mutation gate for `/api/library-truth` POST actions.
 * Requires `x-escape-hatch-local: 1` and either loopback host or
 * `ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1`.
 */
export function evaluateLocalLibraryTruthMutationAccess(input: {
  headerValue: string | null;
  hostHeader?: string | null;
  requestUrl?: string | null;
  allowEnvValue?: string | null;
}): LocalOperatorDecision {
  const headerOk =
    (input.headerValue ?? "").trim() === LOCAL_OPERATOR_HEADER_VALUE;
  if (!headerOk) {
    return {
      allowed: false,
      status: 403,
      error:
        "Library truth mutations require header x-escape-hatch-local: 1 (local prototype operator only — not authentication)."
    };
  }

  const allowEnv = (input.allowEnvValue ?? "").trim() === "1";
  if (allowEnv) {
    return { allowed: true, reason: "explicit_allow" };
  }

  const hostName = hostnameFromHostHeader(input.hostHeader ?? null);
  if (isLoopbackHostname(hostName)) {
    return { allowed: true, reason: "localhost" };
  }

  if (input.requestUrl) {
    try {
      const url = new URL(input.requestUrl);
      if (isLoopbackHostname(url.hostname)) {
        return { allowed: true, reason: "localhost" };
      }
    } catch {
      // ignore malformed URL — fall through to deny
    }
  }

  return {
    allowed: false,
    status: 403,
    error:
      "Library truth mutations are local-prototype only (localhost / 127.0.0.1, or ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1). Not authentication."
  };
}

/** Convenience wrapper for Fetch API Request. */
export function assertLocalLibraryTruthMutation(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): LocalOperatorDecision {
  return evaluateLocalLibraryTruthMutationAccess({
    headerValue: request.headers.get(LOCAL_OPERATOR_HEADER),
    hostHeader: request.headers.get("host"),
    requestUrl: request.url,
    allowEnvValue: env[LOCAL_OPERATOR_ALLOW_ENV] ?? null
  });
}
