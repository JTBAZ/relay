import { patronProfileAssetBrowserFetchPath } from "@/lib/patron-profile-asset-display";
import { pilotUxDevBearerHeaders } from "@/lib/pilot-ux-session";

/** Fetch a patron profile image blob via the same-origin Next proxy (session Bearer + cookies). */
export async function fetchPatronProfileAssetBlob(
  storedUrl: string
): Promise<Blob | null> {
  const browserPath = patronProfileAssetBrowserFetchPath(storedUrl);
  if (!browserPath) return null;
  const headers: Record<string, string> = {
    Accept: "image/*,*/*",
  };
  const pilot = pilotUxDevBearerHeaders();
  if (pilot?.authorization) {
    headers.authorization = pilot.authorization;
  }
  try {
    const res = await fetch(browserPath, {
      credentials: "include",
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}
