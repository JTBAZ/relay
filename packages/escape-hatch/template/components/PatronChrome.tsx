"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { DemoPersona, SiteBundle } from "@/lib/access";
import { applyThemeTokens } from "@/lib/theme";
import { SOFT_PERSONA_COOKIE } from "@/lib/media/types";
import type { IdentityProviderUx } from "@/lib/paywall/types";

type Props = {
  site: SiteBundle;
  personas: DemoPersona[];
  personaId: string;
  onPersonaChange: (id: string) => void;
  children: ReactNode;
  /** Compact header for post detail */
  compact?: boolean;
  /**
   * Identity provider mode (EH-034). Soft persona switch only when `none`.
   * Defaults to none for backward-compatible local preview.
   */
  identityMode?: IdentityProviderUx;
  /** Explicit override; defaults to identityMode === "none". */
  showSoftPersona?: boolean;
};

/** Soft persona id cookie — tiers resolved server-side from the bundle (EH-033). */
function writeSoftPersonaCookie(personaId: string): void {
  if (typeof document === "undefined") return;
  const safe = encodeURIComponent(personaId);
  document.cookie = `${SOFT_PERSONA_COOKIE}=${safe}; Path=/; SameSite=Lax`;
}

export function PatronChrome({
  site,
  personas,
  personaId,
  onPersonaChange,
  children,
  compact = false,
  identityMode = "none",
  showSoftPersona
}: Props) {
  const theme = site.theme;
  const softPersonaVisible =
    showSoftPersona ?? identityMode === "none";

  useEffect(() => {
    applyThemeTokens(theme);
  }, [theme]);

  useEffect(() => {
    if (softPersonaVisible) {
      writeSoftPersonaCookie(personaId);
    }
  }, [personaId, softPersonaVisible]);

  const displayName = theme.hero.title || site.creator.display_name;
  const monogram = displayName.trim().charAt(0).toUpperCase() || "·";

  const banner =
    identityMode === "supabase" || identityMode === "portable"
      ? {
          label: "Membership gate",
          text: "Server entitlement + private media · soft personas do not unlock"
        }
      : identityMode === "invalid"
        ? {
            label: "Identity invalid",
            text: "Provider misconfigured — membership checks fail closed"
          }
        : {
            label: "Soft-gate preview",
            text: "Not production security · persona switch is non-authoritative"
          };

  return (
    <div className="patron-root">
      <a className="skip-link" href="#patron-main">
        Skip to gallery
      </a>

      <div className="patron-banner" role="status">
        <span className="patron-banner-label">{banner.label}</span>
        <span>{banner.text}</span>
        <Link className="patron-banner-account" href="/account">
          Account
        </Link>
      </div>

      <header className={`patron-hero ${compact ? "patron-hero--compact" : ""}`}>
        <div className="patron-hero-inner">
          <div className="patron-brand">
            {theme.logo_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="patron-avatar"
                src={theme.logo_path}
                alt=""
                width={72}
                height={72}
                decoding="async"
              />
            ) : (
              <span className="patron-monogram" aria-hidden="true">
                {monogram}
              </span>
            )}
            <div className="patron-brand-copy">
              <p className="patron-kicker">Membership gallery</p>
              <h1 className="patron-title">{displayName}</h1>
              {!compact && theme.hero.subtitle ? (
                <p className="patron-subtitle">{theme.hero.subtitle}</p>
              ) : null}
              {!compact && theme.hero.bio ? (
                <p className="patron-intro">{theme.hero.bio}</p>
              ) : null}
              {!compact && theme.community_cta ? (
                <p className="patron-cta-row">
                  <a
                    className="patron-community-cta"
                    href={theme.community_cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {theme.community_cta.label}
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          {softPersonaVisible ? (
            <div
              className="soft-gate patron-persona"
              role="group"
              aria-label="Demo persona — preview only, not authoritative"
            >
              <span className="soft-gate-label">View as</span>
              <span className="soft-gate-hint">Preview only</span>
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={p.id === personaId ? "active" : undefined}
                  aria-pressed={p.id === personaId}
                  onClick={() => onPersonaChange(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="patron-account-actions">
              <Link className="patron-community-cta" href="/account">
                Account
              </Link>
              <Link className="patron-console-link" href="/login">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </header>

      <main id="patron-main" className="patron-main">
        {children}
      </main>

      <footer className="patron-footer">
        <Link className="patron-console-link" href="/account">
          Account
        </Link>
        <span className="patron-footer-sep" aria-hidden="true">
          ·
        </span>
        <Link className="patron-console-link" href="/library">
          Hatch Console
        </Link>
        <span className="patron-footer-sep" aria-hidden="true">
          ·
        </span>
        <Link className="patron-console-link" href="/style">
          Style dials
        </Link>
        <span className="patron-footer-note">Operator tools — not visitor chrome</span>
      </footer>
    </div>
  );
}
