"use client";

import { useState, useTransition } from "react";
import type { ContentUseAttestation, ContentUseCategory } from "@/lib/billing/policy/matrix";
import { CONTENT_USE_CATEGORY_LABELS } from "@/lib/billing/policy/matrix";

const CATEGORIES = Object.keys(
  CONTENT_USE_CATEGORY_LABELS
) as ContentUseCategory[];

type RecipeView = {
  id: string;
  title: string;
  offered: boolean;
  reason: string;
  requiresHumanApproval: boolean;
};

type DecisionView = {
  paidLaunchAllowed: boolean;
  stripeEligibility: string;
  recipes: RecipeView[];
  blockers: string[];
};

type Props = {
  siteId: string;
  initialAttestation: ContentUseAttestation;
  initialDecision: DecisionView;
  matrixCheckedAt: string;
  matrixPolicyUrl: string;
};

export function ProviderPolicyPanel({
  siteId,
  initialAttestation,
  initialDecision,
  matrixCheckedAt,
  matrixPolicyUrl
}: Props) {
  const [category, setCategory] = useState<ContentUseCategory>(
    initialAttestation.category === "undeclared"
      ? "general_eligible_business"
      : initialAttestation.category
  );
  const [acceptedTerms, setAcceptedTerms] = useState(
    initialAttestation.acceptedProviderTerms
  );
  const [affirmed, setAffirmed] = useState(initialAttestation.affirmedAccurate);
  const [decision, setDecision] = useState(initialDecision);
  const [attestation, setAttestation] = useState(initialAttestation);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/billing/attestation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-escape-hatch-local": "1"
        },
        body: JSON.stringify({
          siteId,
          category,
          acceptedProviderTerms: acceptedTerms,
          affirmedAccurate: affirmed
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        attestation?: ContentUseAttestation;
        decision?: DecisionView;
      };
      if (!res.ok || !json.ok || !json.attestation || !json.decision) {
        setError(json.error ?? "save_failed");
        return;
      }
      setAttestation(json.attestation);
      setDecision(json.decision);
    });
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Official policy matrix</h2>
        <p className="muted">
          Stripe restricted businesses checked{" "}
          <time dateTime={matrixCheckedAt}>{matrixCheckedAt}</time>
          {" · "}
          <a href={matrixPolicyUrl} rel="noreferrer" target="_blank">
            Current Stripe policy
          </a>
          . Compatible is not permanent — re-check before paid launch.
        </p>
        <ul>
          {decision.recipes.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>
              {" — "}
              {r.offered ? "offered" : "not offered"}
              {r.requiresHumanApproval ? " (needs human approval)" : ""}
              <div className="muted">{r.reason}</div>
            </li>
          ))}
        </ul>
        <p>
          Paid independent launch:{" "}
          <strong>{decision.paidLaunchAllowed ? "allowed" : "blocked"}</strong>
          {" · "}
          Stripe eligibility: {decision.stripeEligibility}
        </p>
        {decision.blockers.length > 0 ? (
          <ul>
            {decision.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="admin-panel">
        <h2>Content / use attestation</h2>
        <p className="muted">
          Routing declaration only — not a private catalog dump. Do not
          misclassify adult sexual content to unlock Stripe.
        </p>
        <label className="admin-field">
          <span>Declared use category</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ContentUseCategory)
            }
            disabled={pending}
          >
            {CATEGORIES.filter((c) => c !== "undeclared").map((c) => (
              <option key={c} value={c}>
                {CONTENT_USE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={pending}
          />{" "}
          I will follow linked provider policies for my declared use
        </label>
        <label className="admin-field">
          <input
            type="checkbox"
            checked={affirmed}
            onChange={(e) => setAffirmed(e.target.checked)}
            disabled={pending}
          />{" "}
          This declaration is accurate to the best of my knowledge
        </label>
        {attestation.attestedAt ? (
          <p className="muted">
            Last attested: {attestation.attestedAt} · category{" "}
            {attestation.category}
          </p>
        ) : (
          <p className="muted">No complete attestation on file.</p>
        )}
        {error ? <p role="alert">{error}</p> : null}
        <button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save attestation"}
        </button>
      </section>
    </div>
  );
}
