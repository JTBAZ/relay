"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { TierCatalogCard } from "@/lib/billing/catalog";

type Props = {
  cards: TierCatalogCard[];
  signedIn: boolean;
  patreonConnectHref: string | null;
  billingNote: string;
  policyBlocked: boolean;
};

export function TierCatalog({
  cards,
  signedIn,
  patreonConnectHref,
  billingNote,
  policyBlocked
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startCheckout(card: TierCatalogCard) {
    if (card.action.blocksCheckout || !card.priceId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tierId: card.tierId,
          priceId: card.priceId,
          tierIds: [card.tierId],
          successPath: "/account?billing=success",
          cancelPath: "/tiers?billing=cancelled"
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        url?: string | null;
      };
      if (!res.ok || !json.ok || !json.url) {
        setError(json.detail ?? json.error ?? "checkout_failed");
        return;
      }
      window.location.href = json.url;
    });
  }

  return (
    <div className="eh-tiers">
      <header className="eh-tiers-header">
        <h1>Membership tiers</h1>
        <p className="lede">
          One catalog for Patreon continuity and independent billing. Access is
          decided on the server — this page never unlocks media by itself.
        </p>
        <p className="meta muted">{billingNote}</p>
        {!signedIn && patreonConnectHref ? (
          <p className="eh-account-actions">
            <Link className="admin-link-btn" href={patreonConnectHref}>
              Connect Patreon
            </Link>
            <span className="muted small">
              {" "}
              Already supporting on Patreon? Connect first.
            </span>
          </p>
        ) : null}
        {policyBlocked ? (
          <p className="eh-account-note eh-account-note--denied" role="status">
            Independent Checkout is blocked for the current provider policy.
            Archive / Patreon paths remain available.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </header>

      <ul className="eh-tiers-list">
        {cards.map((card) => (
          <li key={card.tierId} className="eh-tiers-card">
            <h2>{card.title}</h2>
            <p className="eh-tiers-price">
              {card.priceLabel}
              {card.interval ? ` / ${card.interval}` : ""}
            </p>
            <p>{card.benefitCopy}</p>
            <p className="muted small">
              Access: {card.accessLevel.replace(/_/g, " ")}
            </p>
            {card.patreonContinuityNote ? (
              <p className="muted small">{card.patreonContinuityNote}</p>
            ) : null}
            <p className="muted small">{card.action.reason}</p>
            {card.action.kind === "choose_tier" ||
            card.action.kind === "upgrade" ? (
              card.action.href && card.action.blocksCheckout ? (
                <Link className="admin-link-btn" href={card.action.href}>
                  {card.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={pending || card.action.blocksCheckout}
                  onClick={() => startCheckout(card)}
                >
                  {pending ? "Starting…" : card.action.label}
                </button>
              )
            ) : card.action.href ? (
              <Link className="admin-link-btn" href={card.action.href}>
                {card.action.label}
              </Link>
            ) : (
              <span className="admin-pill">{card.action.label}</span>
            )}
          </li>
        ))}
      </ul>

      {cards.length === 0 ? (
        <p className="muted">No public tiers published yet.</p>
      ) : null}
    </div>
  );
}
