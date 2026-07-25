"use client";

import { adminLocalFetch } from "./adminLocalFetch";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OAuthChoiceDisclosure, OAuthChoiceOptionId } from "@/lib/patreon/oauth-choice";

type Props = {
  disclosures: OAuthChoiceDisclosure[];
  /** Prior explicit preference only — never invent managed as default. */
  initialSelection: OAuthChoiceOptionId | null;
};

/**
 * Neutral OAuth choice surface (EH-043).
 * Neither option is preselected unless the operator previously saved a preference.
 * Managed path cannot be an implicit default.
 */
export function PatreonOAuthChoice({ disclosures, initialSelection }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<OAuthChoiceOptionId | null>(
    initialSelection
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onContinue() {
    if (!selected) {
      setError("Select Own your Patreon connection or Let Relay maintain it before continuing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminLocalFetch("/api/admin/patreon/mode-preference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", preferred_mode: selected })
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "Could not save preference.");
        return;
      }
      router.push(`/admin/patreon?chosen=${selected}`);
      router.refresh();
    });
  }

  return (
    <div className="eh-oauth-choice">
      <p className="muted">
        Equal-weight options. Neither is preselected. Managed Relay verification
        is a separately billed monthly add-on and must not be the default.
      </p>
      <fieldset className="eh-oauth-choice-fieldset">
        <legend className="visually-hidden">Patreon verification path</legend>
        <div className="eh-oauth-choice-grid">
          {disclosures.map((d) => {
            const inputId = `oauth-choice-${d.id}`;
            return (
              <label
                key={d.id}
                htmlFor={inputId}
                className={`eh-oauth-choice-card${selected === d.id ? " is-selected" : ""}`}
              >
                <span className="eh-oauth-choice-card-head">
                  <input
                    id={inputId}
                    type="radio"
                    name="patreon_oauth_choice"
                    value={d.id}
                    checked={selected === d.id}
                    onChange={() => setSelected(d.id)}
                  />
                  <span>
                    <strong>{d.title}</strong>
                    <span className="muted eh-oauth-choice-headline">
                      {d.headline}
                    </span>
                  </span>
                </span>
                <DisclosureBlock disclosure={d} />
              </label>
            );
          })}
        </div>
      </fieldset>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="eh-oauth-choice-actions">
        <button
          type="button"
          className="admin-action-btn"
          disabled={pending || selected === null}
          onClick={onContinue}
        >
          {pending ? "Saving…" : "Continue to setup"}
        </button>
        <p className="muted">
          Continue stays disabled until you make an explicit selection.
        </p>
      </div>
    </div>
  );
}

function DisclosureBlock({ disclosure }: { disclosure: OAuthChoiceDisclosure }) {
  return (
    <div className="eh-oauth-disclosure">
      <p>
        <strong>Cost / dependency</strong>
      </p>
      <p className="muted">{disclosure.costDisclosure}</p>
      <p>
        <strong>Data handled</strong>
      </p>
      <ul>
        {disclosure.dataHandled.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        <strong>Runtime dependencies</strong>
      </p>
      <ul>
        {disclosure.runtimeDependencies.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        <strong>Cancellation effects</strong>
      </p>
      <ul>
        {disclosure.cancellationEffects.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        <strong>Migration path</strong>
      </p>
      <ul>
        {disclosure.migrationPath.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
