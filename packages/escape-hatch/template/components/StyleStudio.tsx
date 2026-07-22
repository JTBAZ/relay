"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  CoverCrop,
  GalleryDensity,
  PaywallStyle,
  SiteBundle,
  TypePairing
} from "@/lib/access";
import { applyThemeTokens, paywallCopy } from "@/lib/theme";

const SCHEMES = [
  { id: "dark", label: "Dark", bg: "#141210" },
  { id: "light", label: "Light", bg: "#f0ebe3" },
  { id: "warm", label: "Midnight", bg: "#10141a" }
] as const;

const ACCENTS = [
  "#c4784a",
  "#2a9d8f",
  "#d4a05a",
  "#c45c6a",
  "#4a7fc4",
  "#8b6bb5"
];

const PAYWALLS: { id: PaywallStyle; label: string; blurb: string }[] = [
  { id: "blur", label: "Blur", blurb: "Soft veil over locked art" },
  { id: "hard", label: "Hard", blurb: "Solid cover until unlock" },
  { id: "teaser", label: "Teaser", blurb: "Gradient fade + CTA" }
];

const TYPE_PAIRINGS: { id: TypePairing; label: string; blurb: string }[] = [
  { id: "editorial", label: "Editorial", blurb: "Fraunces + Source Sans" },
  { id: "studio", label: "Studio", blurb: "Instrument Serif + DM Sans" },
  { id: "signal", label: "Signal", blurb: "Space Grotesk + Newsreader" }
];

const DENSITIES: { id: GalleryDensity; label: string }[] = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" }
];

const CROPS: { id: CoverCrop; label: string }[] = [
  { id: "center", label: "Center" },
  { id: "top", label: "Top" },
  { id: "safe", label: "Safe" }
];

export function StyleStudio({ site }: { site: SiteBundle }) {
  const initial = site.theme;
  const [scheme, setScheme] = useState(initial.color_scheme || "dark");
  const [accent, setAccent] = useState(initial.accent_color || ACCENTS[0]);
  const [title, setTitle] = useState(initial.hero.title);
  const [subtitle, setSubtitle] = useState(initial.hero.subtitle ?? "");
  const [bio, setBio] = useState(initial.hero.bio ?? "");
  const [logoPath, setLogoPath] = useState(initial.logo_path ?? "");
  const [typePairing, setTypePairing] = useState<TypePairing>(
    initial.type_pairing ?? "editorial"
  );
  const [density, setDensity] = useState<GalleryDensity>(
    initial.gallery_density ?? "comfortable"
  );
  const [coverCrop, setCoverCrop] = useState<CoverCrop>(
    initial.cover_crop ?? "center"
  );
  const [paywall, setPaywall] = useState<PaywallStyle>(
    initial.paywall_style ?? "blur"
  );
  const [paywallMessage, setPaywallMessage] = useState(
    initial.paywall_message ?? ""
  );
  const [ctaLabel, setCtaLabel] = useState(initial.community_cta?.label ?? "");
  const [ctaHref, setCtaHref] = useState(initial.community_cta?.href ?? "");

  useEffect(() => {
    applyThemeTokens({
      color_scheme: scheme,
      accent_color: accent,
      type_pairing: typePairing,
      gallery_density: density,
      cover_crop: coverCrop
    });
  }, [scheme, accent, typePairing, density, coverCrop]);

  const liveMessage = paywallCopy(
    { paywall_style: paywall, paywall_message: paywallMessage },
    paywall
  );

  return (
      <div className="shell console-page">
        <p className="banner">
          Session peek — persist with <code>escape-hatch:wizard</code>, then rebuild.
        </p>

        <header className="console-hero">
          <h1>Style</h1>
          <p className="lede muted">
            Controlled branding dials for the visitor gallery — layout stays fixed.
          </p>
        </header>

        <div className="style-layout">
          <form className="style-form" onSubmit={(e) => e.preventDefault()}>
            <fieldset>
              <legend>Color scheme</legend>
              <div className="scheme-row">
                {SCHEMES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`scheme-btn ${scheme === s.id ? "is-active" : ""}`}
                    onClick={() => setScheme(s.id)}
                  >
                    <span
                      className="scheme-swatch"
                      style={{ background: s.bg }}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Accent</legend>
              <div className="accent-row">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Accent ${c}`}
                    className={`accent-dot ${accent === c ? "is-active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setAccent(c)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Type pairing</legend>
              <div className="paywall-row">
                {TYPE_PAIRINGS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`paywall-btn ${typePairing === p.id ? "is-active" : ""}`}
                    onClick={() => setTypePairing(p.id)}
                  >
                    <strong>{p.label}</strong>
                    <span className="muted small">{p.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Brand copy</legend>
              <label className="field">
                <span>Display name</span>
                <input
                  name="display_name"
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Subtitle</span>
                <input
                  name="subtitle"
                  autoComplete="off"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Introduction</span>
                <textarea
                  name="intro"
                  rows={3}
                  autoComplete="off"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Logo / avatar path</span>
                <input
                  name="logo_path"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="/media/avatar.svg…"
                  value={logoPath}
                  onChange={(e) => setLogoPath(e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Gallery</legend>
              <div className="scheme-row">
                {DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`scheme-btn ${density === d.id ? "is-active" : ""}`}
                    onClick={() => setDensity(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="muted small" style={{ margin: "0.75rem 0 0.35rem" }}>
                Cover crop
              </p>
              <div className="scheme-row">
                {CROPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`scheme-btn ${coverCrop === c.id ? "is-active" : ""}`}
                    onClick={() => setCoverCrop(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Paywall style</legend>
              <div className="paywall-row">
                {PAYWALLS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`paywall-btn ${paywall === p.id ? "is-active" : ""}`}
                    onClick={() => setPaywall(p.id)}
                  >
                    <strong>{p.label}</strong>
                    <span className="muted small">{p.blurb}</span>
                  </button>
                ))}
              </div>
              <label className="field" style={{ marginTop: "0.75rem" }}>
                <span>Paywall message</span>
                <input
                  name="paywall_message"
                  autoComplete="off"
                  value={paywallMessage}
                  onChange={(e) => setPaywallMessage(e.target.value)}
                  placeholder="Members only — unlock to view…"
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Community CTA</legend>
              <label className="field">
                <span>Label</span>
                <input
                  name="community_label"
                  autoComplete="off"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="Join the community…"
                />
              </label>
              <label className="field">
                <span>Link</span>
                <input
                  name="community_href"
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="https://…"
                />
              </label>
            </fieldset>
          </form>

          <aside className="style-live-card card">
            <div className={`media-wrap locked ${paywall}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  logoPath ||
                  site.posts[0]?.media[0]?.content_path ||
                  "/media/m_public.svg"
                }
                alt=""
                width={640}
                height={480}
              />
              <div className="paywall-cta">
                <strong>{liveMessage}</strong>
                <span className="cta paywall-cta-btn">Join to unlock</span>
                <span className="paywall-preview-note">
                  Preview only — not a hard paywall
                </span>
                {ctaLabel && ctaHref ? (
                  <span className="paywall-community">{ctaLabel}</span>
                ) : null}
              </div>
            </div>
            <div className="body">
              <div className="badge">Live peek</div>
              <h2 style={{ fontFamily: "var(--eh-font-display)" }}>
                {title || "Untitled"}
              </h2>
              {subtitle ? <p className="sub">{subtitle}</p> : null}
              {bio ? <p className="bio small">{bio}</p> : null}
            </div>
          </aside>
        </div>

        <footer className="console-cta-row">
          <Link className="btn-ghost" href="/structure">
            Back to Structure
          </Link>
          <Link className="btn-primary" href="/preview">
            Open Preview
          </Link>
        </footer>
      </div>
  );
}
