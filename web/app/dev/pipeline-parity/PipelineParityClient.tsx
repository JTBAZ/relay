"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  fetchPatronSessionMe,
  fetchPatreonSyncState,
  hasRelaySignedInCookie,
  relayFetch,
  type PatreonSyncStateData
} from "@/lib/relay-api";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  evaluatePipelineParity,
  type HonestStatus,
  type ParityNode,
  type PipelineParitySnapshotPayload
} from "./evaluateParity";

const SECRET_STORAGE_KEY = "relay_pipeline_parity_secret";
const EXPECTED_FLAGS_KEY = "relay_parity_expected_db_flags_json";

type AccountsPayload = {
  accounts: Array<{
    id: string;
    email_norm: string | null;
    supabase_user_id: string | null;
    primary_relay_creator_id: string | null;
  }>;
  studios: Array<{
    account_id: string;
    relay_creator_id: string;
    patreon_campaign_id: string | null;
    public_slug: string | null;
  }>;
};

async function fetchParityEnvelope<T>(
  path: string,
  secret: string,
  signal?: AbortSignal
): Promise<T> {
  return relayFetch<T>(path, {
    headers: {
      "X-Relay-Pipeline-Parity-Secret": secret
    },
    cache: "no-store",
    signal
  });
}

function statusStyle(s: HonestStatus): string {
  switch (s) {
    case "ok":
      return "border-emerald-500/60 bg-emerald-500/10 text-emerald-100";
    case "degraded":
      return "border-amber-500/60 bg-amber-500/10 text-amber-100";
    case "not_applicable":
      return "border-zinc-500/50 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-sky-500/50 bg-sky-500/10 text-sky-100";
  }
}

function severityLabel(n: ParityNode): string {
  if (n.severity_hint === 0) return "S0 isolation";
  if (n.severity_hint === 1) return "S1 auth/account";
  return "S2 freshness/ops";
}

export default function PipelineParityClient() {
  const [secret, setSecret] = useState("");
  const [accountId, setAccountId] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [campaignOverride, setCampaignOverride] = useState("");
  const [probeUpstream, setProbeUpstream] = useState(false);

  const [accountsPayload, setAccountsPayload] = useState<AccountsPayload | null>(null);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<PipelineParitySnapshotPayload | null>(null);
  const [snapshotErr, setSnapshotErr] = useState<string | null>(null);

  const [syncState, setSyncState] = useState<PatreonSyncStateData | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const [browserState, setBrowserState] = useState({
    supabaseUserId: null as string | null,
    relayCreatorId: null as string | null,
    relaySessionPresent: false,
    meSessionCreatorId: null as string | null
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expectedFlagsBanner, setExpectedFlagsBanner] = useState<string | null>(null);

  useEffect(() => {
    const s = sessionStorage.getItem(SECRET_STORAGE_KEY)?.trim();
    if (s) setSecret(s);
  }, []);

  useEffect(() => {
    if (secret.trim()) {
      sessionStorage.setItem(SECRET_STORAGE_KEY, secret.trim());
    }
  }, [secret]);

  const loadBrowser = useCallback(async () => {
    const supa = getSupabaseBrowserClient();
    let supabaseUserId: string | null = null;
    if (supa) {
      const { data } = await supa.auth.getSession();
      supabaseUserId = data.session?.user?.id ?? null;
    }
    const relayCreatorId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? null
        : null;
    const signedIn = typeof window !== "undefined" ? hasRelaySignedInCookie() : false;
    let meSessionCreatorId: string | null = null;
    if (signedIn) {
      try {
        const me = await fetchPatronSessionMe();
        meSessionCreatorId = me.creator_id ?? null;
      } catch {
        meSessionCreatorId = null;
      }
    }
    setBrowserState({
      supabaseUserId,
      relayCreatorId,
      relaySessionPresent: signedIn,
      meSessionCreatorId
    });
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!secret.trim()) {
      setAccountsErr("Set parity secret first.");
      return;
    }
    setAccountsErr(null);
    try {
      const data = await fetchParityEnvelope<AccountsPayload>(
        "/api/dev/pipeline-parity/accounts",
        secret.trim()
      );
      setAccountsPayload(data);
    } catch (e) {
      setAccountsPayload(null);
      setAccountsErr(e instanceof Error ? e.message : String(e));
    }
  }, [secret]);

  const runSnapshot = useCallback(async () => {
    if (!secret.trim() || !creatorId.trim()) {
      setSnapshotErr("Need secret and creator_id.");
      return;
    }
    setSnapshotErr(null);
    try {
      const q = new URLSearchParams({
        creator_id: creatorId.trim(),
        ...(accountId.trim() ? { account_id: accountId.trim() } : {}),
        ...(campaignOverride.trim() ? { campaign_id: campaignOverride.trim() } : {})
      });
      const data = await fetchParityEnvelope<PipelineParitySnapshotPayload>(
        `/api/dev/pipeline-parity/snapshot?${q}`,
        secret.trim()
      );
      setSnapshot(data);
      /* §D2: optional expected flags from localStorage */
      try {
        const expectedRaw = localStorage.getItem(EXPECTED_FLAGS_KEY);
        if (expectedRaw && data.runtime_manifest) {
          const expected = JSON.parse(expectedRaw) as Record<string, boolean>;
          const m = data.runtime_manifest.relay_db_store;
          const keys = [
            "canonical",
            "creator_oauth",
            "watermark",
            "sync_health"
          ] as const;
          const diffs: string[] = [];
          for (const k of keys) {
            const cur = m[k]?.effective;
            if (typeof expected[k] === "boolean" && expected[k] !== cur) {
              diffs.push(`${k}: expected ${expected[k]}, got ${cur}`);
            }
          }
          setExpectedFlagsBanner(
            diffs.length > 0
              ? `Flag drift vs saved expected profile: ${diffs.join("; ")}`
              : null
          );
        } else {
          setExpectedFlagsBanner(null);
        }
      } catch {
        setExpectedFlagsBanner(null);
      }
    } catch (e) {
      setSnapshot(null);
      setSnapshotErr(e instanceof Error ? e.message : String(e));
    }
  }, [secret, accountId, creatorId, campaignOverride]);

  const runSyncState = useCallback(async () => {
    if (!creatorId.trim()) {
      setSyncErr("Need creator_id.");
      return;
    }
    setSyncErr(null);
    try {
      const s = await fetchPatreonSyncState(creatorId.trim(), {
        campaignId: campaignOverride.trim() || undefined,
        probeUpstream: probeUpstream
      });
      setSyncState(s);
    } catch (e) {
      setSyncState(null);
      setSyncErr(e instanceof Error ? e.message : String(e));
    }
  }, [creatorId, campaignOverride, probeUpstream]);

  const refreshAll = useCallback(async () => {
    await loadBrowser();
    await runSnapshot();
    await runSyncState();
  }, [loadBrowser, runSnapshot, runSyncState]);

  const nodes = useMemo(
    () =>
      evaluatePipelineParity({
        snapshot,
        snapshotError: snapshotErr ?? undefined,
        syncState,
        syncStateError: syncErr ?? undefined,
        browser: browserState,
        selectedCreatorId: creatorId.trim() || "—",
        selectedCampaignId: campaignOverride.trim() || undefined
      }),
    [snapshot, snapshotErr, syncState, syncErr, browserState, creatorId, campaignOverride]
  );

  useEffect(() => {
    void loadBrowser();
  }, [loadBrowser]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-zinc-100">
      <h1 className="text-xl font-semibold tracking-tight">Pipeline parity (truth matrix)</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Honest UI per{" "}
        <code className="rounded bg-zinc-800 px-1 text-xs">docs/architecture/TRUTH_MATRIX_DISCOVERY.md</code>.
        Set{" "}
        <code className="rounded bg-zinc-800 px-1 text-xs">RELAY_PIPELINE_PARITY_SECRET</code> on Relay
        and paste it here (sessionStorage only).
      </p>

      {expectedFlagsBanner ? (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          §D2 env intent: {expectedFlagsBanner}. Save expected flags JSON in localStorage key{" "}
          <code className="text-xs">{EXPECTED_FLAGS_KEY}</code> for comparison.
        </div>
      ) : null}

      <div className="mt-6 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Parity secret
        </label>
        <input
          type="password"
          autoComplete="off"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="matches RELAY_PIPELINE_PARITY_SECRET"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
            onClick={() => void loadAccounts()}
          >
            Load accounts
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={() => void refreshAll()}
          >
            Refresh snapshot + sync-state + browser
          </button>
        </div>
        {accountsErr ? <p className="text-sm text-red-400">{accountsErr}</p> : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Account</h2>
          <select
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
            value={accountId}
            onChange={(e) => {
              const id = e.target.value;
              setAccountId(id);
              const st = accountsPayload?.studios.find((s) => s.account_id === id);
              if (st) {
                setCreatorId(st.relay_creator_id);
                setCampaignOverride(st.patreon_campaign_id ?? "");
              }
            }}
          >
            <option value="">— select —</option>
            {accountsPayload?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email_norm ?? a.id}
                {a.primary_relay_creator_id ? ` · ${a.primary_relay_creator_id}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-zinc-500">
            Multi-studio: pick a studio below or paste a creator id (schema may only expose primary
            studio per account today).
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Studio (relay_creator_id)</h2>
          <select
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
            value={
              accountsPayload?.studios.some((s) => s.relay_creator_id === creatorId)
                ? creatorId
                : ""
            }
            onChange={(e) => setCreatorId(e.target.value)}
          >
            <option value="">— pick from list or type below —</option>
            {accountsPayload?.studios.map((s) => (
              <option key={`${s.account_id}-${s.relay_creator_id}`} value={s.relay_creator_id}>
                {s.relay_creator_id}
                {s.patreon_campaign_id ? ` · campaign ${s.patreon_campaign_id}` : ""}
              </option>
            ))}
          </select>
          <input
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 font-mono text-xs"
            placeholder="relay_creator_id (manual override)"
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Campaign id override (optional)
        </label>
        <input
          className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 font-mono text-sm"
          value={campaignOverride}
          onChange={(e) => setCampaignOverride(e.target.value)}
          placeholder="Patreon numeric campaign id"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={probeUpstream}
            onChange={(e) => setProbeUpstream(e.target.checked)}
          />
          Probe upstream (sync-state <code className="text-xs">probe_upstream=true</code>)
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg border px-3 py-3 ${statusStyle(n.status)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{n.label}</span>
                  <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] uppercase">
                    {n.status}
                  </span>
                  <span className="text-[10px] text-zinc-400">{severityLabel(n)}</span>
                </div>
                <p className="mt-1 text-sm opacity-90">{n.summary}</p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs underline opacity-80 hover:opacity-100"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [n.id]: !prev[n.id] }))
                }
              >
                {expanded[n.id] ? "Hide" : "Prove / display"}
              </button>
            </div>
            {expanded[n.id] ? (
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                <div>
                  <div className="font-semibold text-zinc-400">Prove (behavioral)</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/30 p-2 text-[11px]">
                    {JSON.stringify(n.prove, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-zinc-400">Display (diagnostic)</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/30 p-2 text-[11px]">
                    {JSON.stringify(n.display, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-500">
        <div className="font-medium text-zinc-400">Raw errors</div>
        <p>snapshot: {snapshotErr ?? "—"}</p>
        <p>sync-state: {syncErr ?? "—"}</p>
        <div className="mt-2 font-medium text-zinc-400">Browser snapshot</div>
        <pre className="mt-1 overflow-auto text-[11px] text-zinc-400">
          {JSON.stringify(browserState, null, 2)}
        </pre>
      </div>
    </div>
  );
}
