import { NextRequest, NextResponse } from "next/server";
import { resolveRelayApiBaseFromEnv } from "@/lib/relay-api-env";
import { relayPatronAssetAuthHeader } from "@/lib/relay-session-cookie";

type RouteParams = {
  params: { accountId: string; kind: string; assetId: string };
};

/** Same-origin proxy for patron profile R2 assets (forwards session Bearer/cookies to Relay API). */
export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { accountId, kind, assetId } = params;
  if (!accountId || !assetId || (kind !== "avatar" && kind !== "banner")) {
    return new NextResponse(null, { status: 404 });
  }

  const relay = resolveRelayApiBaseFromEnv(process.env.NEXT_PUBLIC_RELAY_API_URL);
  const target = `${relay}/api/v1/public/patron-profile-assets/${encodeURIComponent(accountId)}/${kind}/${encodeURIComponent(assetId)}/content`;

  const headers = new Headers();
  const cookie = req.headers.get("cookie");
  const auth = relayPatronAssetAuthHeader({
    authorizationHeader: req.headers.get("authorization"),
    cookieHeader: cookie,
  });
  if (auth) headers.set("authorization", auth);
  if (cookie) headers.set("cookie", cookie);

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, cache: "no-store" });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      vary: "Authorization, Cookie",
    },
  });
}
