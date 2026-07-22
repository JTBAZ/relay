"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { DemoPersona, SiteBundle } from "@/lib/access";
import { applyThemeTokens } from "@/lib/theme";

type Props = {
  site: SiteBundle;
  personas: DemoPersona[];
  personaId: string;
  onPersonaChange: (id: string) => void;
  children: ReactNode;
  /** Compact header for post detail */
  compact?: boolean;
};

export function PatronChrome({
  site,
  personas,
  personaId,
  onPersonaChange,
  children,
  compact = false
}: Props) {
  const theme = site.theme;

  useEffect(() => {
    applyThemeTokens(theme);
  }, [theme]);

  const displayName = theme.hero.title || site.creator.display_name;
  const monogram = displayName.trim().charAt(0).toUpperCase() || "·";

  return (
    <div className="patron-root">
      <a className="skip-link" href="#patron-main">
        Skip to gallery
      </a>

      <div className="patron-banner" role="status">
        <span className="patron-banner-label">Soft-gate preview</span>
        <span>Not production security · persona switch is non-authoritative</span>
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
        </div>
      </header>

      <main id="patron-main" className="patron-main">
        {children}
      </main>

      <footer className="patron-footer">
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
