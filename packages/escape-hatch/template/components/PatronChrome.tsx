"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { DemoPersona, SiteBundle } from "@/lib/access";
import { applyThemeTokens } from "@/lib/theme";
import { SOFT_PERSONA_COOKIE } from "@/lib/media/types";
import type { IdentityProviderUx } from "@/lib/paywall/types";

type Props = {
  site: SiteBundle;
  personas?: DemoPersona[];
  personaId?: string;
  onPersonaChange?: (id: string) => void;
  children: ReactNode;
  /** Compact sticky bar for post / account */
  compact?: boolean;
  /**
   * Identity provider mode (EH-034). Soft persona switch only when `none`.
   * Defaults to none for backward-compatible local preview.
   */
  identityMode?: IdentityProviderUx;
  /** Explicit override; defaults to identityMode === "none". */
  showSoftPersona?: boolean;
  /** Slim about strip under the sticky bar (gallery home). */
  showAbout?: boolean;
};

/** Soft persona id cookie — tiers resolved server-side from the bundle (EH-033). */
function writeSoftPersonaCookie(personaId: string): void {
  if (typeof document === "undefined") return;
  const safe = encodeURIComponent(personaId);
  document.cookie = `${SOFT_PERSONA_COOKIE}=${safe}; Path=/; SameSite=Lax`;
}

export function PatronChrome({
  site,
  personas = [],
  personaId = "",
  onPersonaChange,
  children,
  compact = false,
  identityMode = "none",
  showSoftPersona,
  showAbout = false
}: Props) {
  const theme = site.theme;
  const softPersonaVisible =
    (showSoftPersona ?? identityMode === "none") && personas.length > 0;

  useEffect(() => {
    applyThemeTokens(theme);
  }, [theme]);

  useEffect(() => {
    if (softPersonaVisible && personaId) {
      writeSoftPersonaCookie(personaId);
    }
  }, [personaId, softPersonaVisible]);

  const displayName = theme.hero.title || site.creator.display_name;
  const monogram = displayName.trim().charAt(0).toUpperCase() || "·";

  const banner =
    identityMode === "supabase" || identityMode === "portable"
      ? {
          label: "Membership gate",
          text: "Server entitlement + private media. Soft personas do not unlock."
        }
      : identityMode === "invalid"
        ? {
            label: "Identity invalid",
            text: "Provider misconfigured — membership checks fail closed."
          }
        : {
            label: "Soft-gate preview",
            text: "Not production security. Persona switch is non-authoritative."
          };

  const aboutBits = [
    theme.hero.subtitle?.trim(),
    theme.hero.bio?.trim()
  ].filter(Boolean) as string[];

  return (
    <div className="patron-root">
      <a className="skip-link" href="#patron-main">
        Skip to gallery
      </a>

      <div className="patron-operator" role="status">
        <span className="patron-operator-label">{banner.label}</span>
        <span className="patron-operator-text">{banner.text}</span>
        {softPersonaVisible ? (
          <div
            className="soft-gate patron-persona"
            role="group"
            aria-label="Demo persona — preview only, not authoritative"
          >
            <span className="soft-gate-label">View as</span>
            {personas.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === personaId ? "active" : undefined}
                aria-pressed={p.id === personaId}
                onClick={() => onPersonaChange?.(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <header
        className={`patron-topbar ${compact ? "patron-topbar--compact" : ""}`}
      >
        <div className="patron-topbar-inner">
          <Link href="/preview" className="patron-brand-link">
            {theme.logo_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="patron-avatar"
                src={theme.logo_path}
                alt=""
                width={40}
                height={40}
                decoding="async"
              />
            ) : (
              <span className="patron-monogram" aria-hidden="true">
                {monogram}
              </span>
            )}
            <span className="patron-title">{displayName}</span>
          </Link>

          <nav className="patron-topbar-nav" aria-label="Account">
            <Link className="patron-nav-link" href="/account">
              Account
            </Link>
            {!softPersonaVisible ? (
              <Link className="patron-nav-link patron-nav-link--quiet" href="/login">
                Sign in
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      {showAbout && (aboutBits.length > 0 || theme.community_cta) ? (
        <aside className="patron-about" aria-label="About">
          <div className="patron-about-inner">
            {aboutBits.map((line, i) => (
              <p key={i} className={i === 0 ? "patron-about-lead" : "patron-about-body"}>
                {line}
              </p>
            ))}
            {theme.community_cta ? (
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
        </aside>
      ) : null}

      <main id="patron-main" className="patron-main">
        {children}
      </main>

      <footer className="patron-footer">
        <Link className="patron-footer-link" href="/account">
          Account
        </Link>
        <div className="patron-footer-operator">
          <span className="patron-footer-note">Operator</span>
          <Link className="patron-console-link" href="/library">
            Hatch Console
          </Link>
          <span className="patron-footer-sep" aria-hidden="true">
            /
          </span>
          <Link className="patron-console-link" href="/style">
            Style dials
          </Link>
        </div>
      </footer>
    </div>
  );
}
