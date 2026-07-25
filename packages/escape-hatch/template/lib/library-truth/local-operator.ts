/**
 * Local-prototype operator gate for kit mutations (library-truth, admin attention).
 *
 * Not authentication. Shared-preview hosts must reject mutations.
 * Mutations require `x-escape-hatch-local: 1` and a loopback host only —
 * there is no remote env override.
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
 * Fail-closed mutation gate for local-prototype operator APIs.
 * Requires `x-escape-hatch-local: 1` and a loopback host (localhost / 127.0.0.1 / ::1).
 * Not authentication — hosted previews cannot enable mutations via env alone.
 */
export function evaluateLocalOperatorMutationAccess(input: {
  headerValue: string | null;
  hostHeader?: string | null;
  requestUrl?: string | null;
  /** Surface label used in deny errors (e.g. "Library truth", "Admin"). */
  surface?: string;
}): LocalOperatorDecision {
  const surface = (input.surface ?? "Local operator").trim() || "Local operator";
  const headerOk =
    (input.headerValue ?? "").trim() === LOCAL_OPERATOR_HEADER_VALUE;
  if (!headerOk) {
    return {
      allowed: false,
      status: 403,
      error: `${surface} mutations require header x-escape-hatch-local: 1 (local prototype operator only — not authentication).`
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
    error: `${surface} mutations are local-prototype only (localhost / 127.0.0.1). Not authentication.`
  };
}

/** Convenience wrapper for Fetch API Request. */
export function assertLocalOperatorMutation(
  request: Request,
  surface = "Local operator"
): LocalOperatorDecision {
  return evaluateLocalOperatorMutationAccess({
    headerValue: request.headers.get(LOCAL_OPERATOR_HEADER),
    hostHeader: request.headers.get("host"),
    requestUrl: request.url,
    surface
  });
}

/** @deprecated Prefer evaluateLocalOperatorMutationAccess — kept for library-truth call sites. */
export function evaluateLocalLibraryTruthMutationAccess(input: {
  headerValue: string | null;
  hostHeader?: string | null;
  requestUrl?: string | null;
}): LocalOperatorDecision {
  return evaluateLocalOperatorMutationAccess({
    ...input,
    surface: "Library truth"
  });
}

/** @deprecated Prefer assertLocalOperatorMutation — kept for library-truth call sites. */
export function assertLocalLibraryTruthMutation(
  request: Request
): LocalOperatorDecision {
  return assertLocalOperatorMutation(request, "Library truth");
}
