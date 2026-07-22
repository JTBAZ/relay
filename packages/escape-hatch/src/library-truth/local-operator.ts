/**
 * Local-prototype operator gate for library-truth mutations (EH-013).
 *
 * Not authentication. Shared-preview hosts must reject exclude/complete.
 * Mutations require `x-escape-hatch-local: 1` and a loopback host only —
 * there is no remote env override (ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW is not honored).
 */

export const LOCAL_OPERATOR_HEADER = "x-escape-hatch-local" as const;
export const LOCAL_OPERATOR_HEADER_VALUE = "1" as const;

export type LocalOperatorDecision =
  | { allowed: true; reason: "localhost" }
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
 * Requires `x-escape-hatch-local: 1` and a loopback host (localhost / 127.0.0.1 / ::1).
 * Not authentication — hosted previews cannot enable mutations via env alone.
 */
export function evaluateLocalLibraryTruthMutationAccess(input: {
  headerValue: string | null;
  hostHeader?: string | null;
  requestUrl?: string | null;
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
      "Library truth mutations are local-prototype only (localhost / 127.0.0.1). Not authentication."
  };
}

/** Convenience wrapper for Fetch API Request. */
export function assertLocalLibraryTruthMutation(
  request: Request
): LocalOperatorDecision {
  return evaluateLocalLibraryTruthMutationAccess({
    headerValue: request.headers.get(LOCAL_OPERATOR_HEADER),
    hostHeader: request.headers.get("host"),
    requestUrl: request.url
  });
}
