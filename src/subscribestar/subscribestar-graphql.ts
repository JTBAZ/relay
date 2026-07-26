/**
 * Minimal SubscribeStar GraphQL POST helper (`/api/graphql/v1`).
 */

export async function subscribeStarGraphqlRequest<T>(
  graphqlUrl: string,
  accessToken: string,
  body: { query: string; variables?: Record<string, unknown> },
  fetchImpl: typeof fetch
): Promise<T> {
  const response = await fetchImpl(graphqlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `SubscribeStar GraphQL returned non-JSON (${response.status}): ${text.slice(0, 280)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `SubscribeStar GraphQL HTTP ${response.status}: ${typeof parsed === "object" ? JSON.stringify(parsed).slice(0, 400) : text.slice(0, 400)}`
    );
  }

  return parsed as T;
}
