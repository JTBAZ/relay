"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  lastServiceDateIso: string | null;
  migrationSteps: string[];
};

/**
 * Switch-off toward creator_oauth (EH-043).
 * Does not delete patrons; does not rebuild the kit; preference is non-secret.
 */
export function PatreonModeSwitchOff({
  lastServiceDateIso,
  migrationSteps
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSwitchOff() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/patreon/mode-preference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "switch_off_to_creator_oauth" })
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        envInstruction?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "Switch-off failed.");
        return;
      }
      setDone(
        body.envInstruction ??
          "Preference set to creator_oauth. Set ESCAPE_HATCH_PATREON_MODE=creator_oauth on the host."
      );
      router.refresh();
    });
  }

  return (
    <div className="eh-oauth-switch-off">
      <p className="muted">
        Replace managed verification without rebuilding the site. Linked patrons
        are not deleted. Native accounts, media, and admin continue.
      </p>
      {lastServiceDateIso ? (
        <p role="status">
          Exact last service date:{" "}
          <span className="mono">{lastServiceDateIso.slice(0, 10)}</span>
        </p>
      ) : (
        <p className="muted" role="status">
          Last service date not mirrored yet — set{" "}
          <span className="mono">
            ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE
          </span>{" "}
          when cancelling.
        </p>
      )}
      <ol>
        {migrationSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status">{done}</p>
      ) : null}
      <button
        type="button"
        className="admin-action-btn"
        disabled={pending}
        onClick={onSwitchOff}
      >
        {pending ? "Switching…" : "Switch preferred mode to creator_oauth"}
      </button>
    </div>
  );
}
