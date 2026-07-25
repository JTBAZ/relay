"use client";

import { adminLocalFetch } from "./adminLocalFetch";
import { useEffect, useState } from "react";
import type {
  CoverCrop,
  EscapeHatchTheme,
  GalleryDensity,
  PaywallStyle,
  TypePairing
} from "@/lib/access";
import { applyThemeTokens } from "@/lib/theme";

const SCHEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "warm", label: "Midnight" }
] as const;

const ACCENTS = [
  "#4a7fc4",
  "#c45c6a",
  "#2a9d8f",
  "#8b6bb5",
  "#c4784a",
  "#d4a05a"
];

export function AdminAppearanceEditor({
  siteId,
  initialTheme
}: {
  siteId: string;
  initialTheme: EscapeHatchTheme;
}) {
  const [scheme, setScheme] = useState(initialTheme.color_scheme || "dark");
  const [accent, setAccent] = useState(initialTheme.accent_color || ACCENTS[0]);
  const [title, setTitle] = useState(initialTheme.hero.title);
  const [subtitle, setSubtitle] = useState(initialTheme.hero.subtitle ?? "");
  const [bio, setBio] = useState(initialTheme.hero.bio ?? "");
  const [logoPath, setLogoPath] = useState(initialTheme.logo_path ?? "");
  const [typePairing, setTypePairing] = useState<TypePairing>(
    initialTheme.type_pairing ?? "editorial"
  );
  const [density, setDensity] = useState<GalleryDensity>(
    initialTheme.gallery_density ?? "comfortable"
  );
  const [coverCrop, setCoverCrop] = useState<CoverCrop>(
    initialTheme.cover_crop ?? "center"
  );
  const [paywall, setPaywall] = useState<PaywallStyle>(
    initialTheme.paywall_style ?? "blur"
  );
  const [paywallMessage, setPaywallMessage] = useState(
    initialTheme.paywall_message ?? ""
  );
  const [ctaLabel, setCtaLabel] = useState(
    initialTheme.community_cta?.label ?? ""
  );
  const [ctaHref, setCtaHref] = useState(
    initialTheme.community_cta?.href ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    applyThemeTokens({
      color_scheme: scheme,
      accent_color: accent,
      type_pairing: typePairing,
      gallery_density: density,
      cover_crop: coverCrop
    });
  }, [scheme, accent, typePairing, density, coverCrop]);

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminLocalFetch("/api/admin/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          color_scheme: scheme,
          accent_color: accent,
          type_pairing: typePairing,
          gallery_density: density,
          cover_crop: coverCrop,
          paywall_style: paywall,
          paywall_message: paywallMessage,
          logo_path: logoPath,
          hero: { title, subtitle, bio },
          community_cta:
            ctaLabel.trim() && ctaHref.trim()
              ? { label: ctaLabel, href: ctaHref }
              : null
        })
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "Publish failed");
        return;
      }
      setMessage(
        `Published appearance for ${siteId}. Visitor gallery uses theme-vars.css + site.json (preview_only).`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Appearance editor">
      <p className="small muted">
        Approved dials only — no raw CSS/scripts. Preview updates live tokens;
        Publish writes kit data. Site <span className="mono">{siteId}</span>.
      </p>
      {message ? <p className="admin-attention-note">{message}</p> : null}

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="small muted">Scheme</span>
          <select
            value={scheme}
            onChange={(e) => setScheme(e.target.value as typeof scheme)}
          >
            {SCHEMES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span className="small muted">Type pairing</span>
          <select
            value={typePairing}
            onChange={(e) => setTypePairing(e.target.value as TypePairing)}
          >
            <option value="editorial">Editorial</option>
            <option value="studio">Studio</option>
            <option value="signal">Signal</option>
          </select>
        </label>
        <label className="admin-field">
          <span className="small muted">Paywall style</span>
          <select
            value={paywall}
            onChange={(e) => setPaywall(e.target.value as PaywallStyle)}
          >
            <option value="blur">Blur</option>
            <option value="hard">Hard</option>
            <option value="teaser">Teaser</option>
          </select>
        </label>
      </div>

      <fieldset className="admin-field">
        <legend className="small muted">Accent</legend>
        <div className="admin-field-row">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              className={`admin-link-btn admin-link-btn--compact ${
                accent === a ? "is-active" : ""
              }`}
              style={{ borderColor: a }}
              onClick={() => setAccent(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="admin-field">
        <span className="small muted">Hero title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="admin-field">
        <span className="small muted">Hero subtitle</span>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </label>
      <label className="admin-field">
        <span className="small muted">Hero bio</span>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="admin-field">
        <span className="small muted">Logo path</span>
        <input
          value={logoPath}
          onChange={(e) => setLogoPath(e.target.value)}
          placeholder="/media/logo.svg"
        />
      </label>
      <label className="admin-field">
        <span className="small muted">Paywall message</span>
        <input
          value={paywallMessage}
          onChange={(e) => setPaywallMessage(e.target.value)}
        />
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="small muted">Gallery density</span>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as GalleryDensity)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="admin-field">
          <span className="small muted">Cover crop</span>
          <select
            value={coverCrop}
            onChange={(e) => setCoverCrop(e.target.value as CoverCrop)}
          >
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="safe">Safe</option>
          </select>
        </label>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="small muted">Community CTA label</span>
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="small muted">Community CTA href</span>
          <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
        </label>
      </div>

      <p className="small muted">
        Preview:{" "}
        <a href="/" target="_blank" rel="noreferrer">
          gallery mosaic
        </a>{" "}
        · open search on the gallery to check feed mode.
      </p>

      <button
        type="button"
        className="admin-link-btn"
        disabled={busy}
        onClick={() => void publish()}
      >
        {busy ? "Publishing…" : "Publish appearance"}
      </button>
    </section>
  );
}
