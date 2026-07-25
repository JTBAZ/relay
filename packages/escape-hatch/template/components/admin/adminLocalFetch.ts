/**
 * Client helper for Hatch Console calls to `/api/admin/*`.
 *
 * When identity is unset, those routes use `assertAdminMutationAccess`, which
 * requires `x-escape-hatch-local: 1` plus loopback Host. The header alone never
 * unlocks remote hosts; configured Path A/B staff sessions ignore it.
 */

export const LOCAL_OPERATOR_HEADER = "x-escape-hatch-local" as const;
export const LOCAL_OPERATOR_HEADER_VALUE = "1" as const;

export function withLocalOperatorHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set(LOCAL_OPERATOR_HEADER, LOCAL_OPERATOR_HEADER_VALUE);
  return headers;
}

/** fetch() that always attaches the local-operator header for admin APIs. */
export function adminLocalFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocalOperatorHeaders(init?.headers)
  });
}
