"use client";

import { useCallback, useEffect, useState } from "react";

type Readiness = {
  ok: boolean;
  detail: string;
  packet_generated: boolean;
  launch_complete_hint: boolean;
  packet_path: string | null;
  last_generated_at: string | null;
};

export function OwnershipPacketPanel({ siteId }: { siteId: string }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/ownership", { method: "GET" });
    const json = (await res.json()) as {
      ok?: boolean;
      readiness?: Readiness;
      error?: string;
    };
    if (res.ok && json.readiness) setReadiness(json.readiness);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, siteId]);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate" })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        readiness?: Readiness;
      };
      if (json.readiness) setReadiness(json.readiness);
      setMessage(
        res.ok && json.ok
          ? "Ownership packet generated (env names only — not productionSafe)."
          : json.error ?? "Generate failed"
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ownership?download=1", {
        method: "GET"
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(
          typeof json.error === "string" ? json.error : "Download failed"
        );
        return;
      }
      const blob = new Blob([JSON.stringify(json.packet, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ownership-packet.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Downloaded ownership-packet.json (preview).");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="ownership-packet-title">
      <h2 id="ownership-packet-title" className="admin-section-title">
        Ownership packet (EH-080)
      </h2>
      <p className="small muted">
        Handoff artifact: manifesto, env-name inventory, optional Relay
        disclosure, 90-day warranty boundary. No secrets. Live independence
        proof deferred to EH-082.
      </p>
      {readiness ? (
        <p
          className={`admin-banner ${readiness.ok ? "admin-banner--ok" : "admin-banner--degraded"}`}
        >
          <strong>
            {readiness.packet_generated ? "Packet ready" : "Packet not generated"}
          </strong>{" "}
          — {readiness.detail}
        </p>
      ) : (
        <p className="small muted">Loading…</p>
      )}
      <div className="admin-form-stack">
        <button type="button" disabled={busy} onClick={() => void generate()}>
          Generate ownership packet
        </button>
        <button
          type="button"
          disabled={busy || !readiness?.packet_generated}
          onClick={() => void download()}
        >
          Download packet JSON
        </button>
      </div>
      {readiness?.packet_path ? (
        <p className="small mono">{readiness.packet_path}</p>
      ) : null}
      {message ? <p className="small">{message}</p> : null}
    </section>
  );
}
