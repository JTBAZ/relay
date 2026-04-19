"use client";

import { format, formatDistanceToNow, parseISO } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { relayFetch, relayPatronAuthHeaders } from "@/lib/relay-api";
import { RevokeButton } from "./RevokeButton";

export type ExtensionGrantRow = {
  token_id: string;
  label: string | null;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
};

function formatLastUsed(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatExpires(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "PPp");
  } catch {
    return "—";
  }
}

export function ConnectedExtensionsClient() {
  const [grants, setGrants] = useState<ExtensionGrantRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await relayFetch<{ grants: ExtensionGrantRow[] }>(
        "/api/v1/auth/extension/grants",
        { headers: { ...relayPatronAuthHeaders() } }
      );
      setGrants(data.grants ?? []);
    } catch (e) {
      setGrants(null);
      setLoadError(e instanceof Error ? e.message : "Could not load extensions.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <p className="rounded border border-red-500/40 bg-red-950/50 p-4 text-sm text-red-200">
        {loadError}
      </p>
    );
  }

  if (grants === null) {
    return <p className="text-sm text-stone-400">Loading…</p>;
  }

  if (grants.length === 0) {
    return (
      <div className="rounded border border-stone-600 bg-stone-900/40 p-6 text-sm text-stone-300">
        <p className="text-stone-200">
          No connected extensions. Install the{" "}
          <Link
            href="/patreon/cookie"
            className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
          >
            Relay browser extension
          </Link>{" "}
          (via the Patreon cookie flow) to capture your Patreon session in one click.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-stone-600">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead className="border-b border-stone-600 bg-stone-900/80 text-stone-300">
          <tr>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Last used</th>
            <th className="px-4 py-3 font-medium">Expires</th>
            <th className="w-28 px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.token_id} className="border-b border-stone-700/80 last:border-0">
              <td className="px-4 py-3 text-stone-100">{g.label?.trim() || "Extension"}</td>
              <td className="px-4 py-3 text-stone-400">{formatLastUsed(g.last_used_at)}</td>
              <td className="px-4 py-3 text-stone-400">{formatExpires(g.expires_at)}</td>
              <td className="px-4 py-3 text-right">
                <RevokeButton
                  tokenId={g.token_id}
                  label={g.label?.trim() || "Extension"}
                  onRevoked={load}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
