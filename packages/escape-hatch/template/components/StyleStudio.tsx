"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PaywallStyle, SiteBundle } from "@/lib/access";

const SCHEMES = [
  { id: "dark", label: "Dark", bg: "#313338" },
  { id: "light", label: "Light", bg: "#ffffff" },
  { id: "warm", label: "Midnight", bg: "#1e1f22" }
] as const;

const ACCENTS = [
  "#5865f2",
  "#57f287",
  "#eb459e",
  "#ed4245",
  "#fee75c",
  "#00a8fc"
];

const PAYWALLS: { id: PaywallStyle; label: string; blurb: string }[] = [
  { id: "blur", label: "Blur", blurb: "Soft veil over locked art" },
  { id: "hard", label: "Hard", blurb: "Solid cover until unlock" },
  { id: "teaser", label: "Teaser", blurb: "Gradient fade + CTA" }
];

const SCHEME_VARS: Record<
  string,
  {
    bg: string;
    fg: string;
    muted: string;
    card: string;
    deep: string;
    hover: string;
    border: string;
  }
> = {
  dark: {
    bg: "#313338",
    fg: "#f2f3f5",
    muted: "#b5bac1",
    card: "#2b2d31",
    deep: "#1e1f22",
    hover: "#35373c",
    border: "#3f4147"
  },
  light: {
    bg: "#ffffff",
    fg: "#060607",
    muted: "#4e5058",
    card: "#f2f3f5",
    deep: "#e3e5e8",
    hover: "#ebebeb",
    border: "#d1d3d7"
  },
  warm: {
    bg: "#2b2d31",
    fg: "#f2f3f5",
    muted: "#b5bac1",
    card: "#1e1f22",
    deep: "#111214",
    hover: "#35373c",
    border: "#3f4147"
  }
};

function applyCssVars(opts: {
  scheme: string;
  accent: string;
}): void {
  const s = SCHEME_VARS[opts.scheme] ?? SCHEME_VARS.dark;
  const root = document.documentElement;
  root.style.setProperty("--eh-bg", s.bg);
  root.style.setProperty("--eh-fg", s.fg);
  root.style.setProperty("--eh-muted", s.muted);
  root.style.setProperty("--eh-card", s.card);
  root.style.setProperty("--eh-accent", opts.accent);
  root.style.setProperty("--eh-bg-deep", s.deep);
  root.style.setProperty("--eh-hover", s.hover);
  root.style.setProperty("--eh-border", s.border);
}

export function StyleStudio({ site }: { site: SiteBundle }) {
  const initial = site.theme;
  const [scheme, setScheme] = useState(initial.color_scheme || "dark");
  const [accent, setAccent] = useState(initial.accent_color || ACCENTS[0]);
  const [title, setTitle] = useState(initial.hero.title);
  const [subtitle, setSubtitle] = useState(initial.hero.subtitle ?? "");
  const [bio, setBio] = useState(initial.hero.bio ?? "");
  const [paywall, setPaywall] = useState<PaywallStyle>(
    initial.paywall_style ?? "blur"
  );

  useEffect(() => {
    applyCssVars({ scheme, accent });
  }, [scheme, accent]);

  return (
    <div className="shell console-page">
      <p className="banner">
        Session peek — persist with <code>escape-hatch:wizard</code>, then rebuild.
      </p>

      <header className="console-hero">
        <h1>Style</h1>
        <p className="lede muted">
          Mood, accent, door copy, lock look — layout stays fixed.
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
            <legend>Hero copy</legend>
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Subtitle</span>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Bio</span>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
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
          </fieldset>
        </form>

        <aside className="style-live-card card">
          <div className={`media-wrap locked ${paywall}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={site.posts[0]?.media[0]?.content_path ?? "/media/m_public.svg"}
              alt=""
            />
            <div className="paywall-cta">
              <strong>
                {paywall === "hard"
                  ? "Members only"
                  : paywall === "teaser"
                    ? "Peek reserved for subscribers"
                    : "Unlock to view"}
              </strong>
              <span className="cta">Join to unlock</span>
            </div>
          </div>
          <div className="body">
            <div className="badge">Live peek</div>
            <h2>{title || "Untitled"}</h2>
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
