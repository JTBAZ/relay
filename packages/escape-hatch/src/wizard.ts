/**
 * Interactive CLI wizard → EscapeHatchTheme (controlled branding dials).
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type {
  ColorScheme,
  CoverCrop,
  EscapeHatchTheme,
  GalleryDensity,
  PaywallStyle,
  TypePairing
} from "./types.js";

const SCHEMES: ColorScheme[] = ["dark", "light", "warm"];
const ACCENTS = [
  "#4a7fc4",
  "#c45c6a",
  "#2a9d8f",
  "#8b6bb5",
  "#c4784a",
  "#d4a05a"
];
const PAYWALLS: PaywallStyle[] = ["blur", "hard", "teaser"];
const TYPE_PAIRINGS: TypePairing[] = ["editorial", "studio", "signal"];
const DENSITIES: GalleryDensity[] = ["comfortable", "compact"];
const CROPS: CoverCrop[] = ["center", "top", "safe"];

async function ask(
  rl: readline.Interface,
  prompt: string,
  fallback: string
): Promise<string> {
  const raw = await rl.question(`${prompt} [${fallback}]: `);
  const v = raw.trim();
  return v.length ? v : fallback;
}

export type WizardDefaults = Partial<EscapeHatchTheme> & {
  hero?: Partial<EscapeHatchTheme["hero"]>;
};

export async function runWizard(
  defaults?: WizardDefaults
): Promise<EscapeHatchTheme> {
  const rl = readline.createInterface({ input, output });
  try {
    const base = defaults?.color_scheme ?? "dark";
    const schemeRaw = await ask(
      rl,
      `Color scheme (${SCHEMES.join("|")})`,
      base
    );
    const color_scheme = (SCHEMES.includes(schemeRaw as ColorScheme)
      ? schemeRaw
      : base) as ColorScheme;

    const accentDefault = defaults?.accent_color ?? ACCENTS[0];
    console.log(`Accent presets: ${ACCENTS.join(", ")}`);
    const accent_color = await ask(rl, "Accent color (hex)", accentDefault);

    const title = await ask(
      rl,
      "Display name / hero title",
      defaults?.hero?.title ?? "My Gallery"
    );
    const subtitle = await ask(
      rl,
      "Hero subtitle",
      defaults?.hero?.subtitle ?? "Independent membership gallery"
    );
    const bio = await ask(
      rl,
      "Short introduction",
      defaults?.hero?.bio ?? "Art and tiers you own."
    );

    const logo_path = await ask(
      rl,
      "Logo / avatar path (public URL path, blank to skip)",
      defaults?.logo_path ?? ""
    );

    const typeDefault = defaults?.type_pairing ?? "editorial";
    const typeRaw = await ask(
      rl,
      `Type pairing (${TYPE_PAIRINGS.join("|")})`,
      typeDefault
    );
    const type_pairing = (TYPE_PAIRINGS.includes(typeRaw as TypePairing)
      ? typeRaw
      : typeDefault) as TypePairing;

    const densityDefault = defaults?.gallery_density ?? "comfortable";
    const densityRaw = await ask(
      rl,
      `Gallery density (${DENSITIES.join("|")})`,
      densityDefault
    );
    const gallery_density = (DENSITIES.includes(densityRaw as GalleryDensity)
      ? densityRaw
      : densityDefault) as GalleryDensity;

    const cropDefault = defaults?.cover_crop ?? "center";
    const cropRaw = await ask(
      rl,
      `Cover crop (${CROPS.join("|")})`,
      cropDefault
    );
    const cover_crop = (CROPS.includes(cropRaw as CoverCrop)
      ? cropRaw
      : cropDefault) as CoverCrop;

    const pwDefault = defaults?.paywall_style ?? "blur";
    const pwRaw = await ask(
      rl,
      `Paywall style (${PAYWALLS.join("|")})`,
      pwDefault
    );
    const paywall_style = (PAYWALLS.includes(pwRaw as PaywallStyle)
      ? pwRaw
      : pwDefault) as PaywallStyle;

    const paywall_message = await ask(
      rl,
      "Paywall message",
      defaults?.paywall_message ?? "Members only — unlock to view"
    );

    const ctaLabel = await ask(
      rl,
      "Community CTA label (blank to skip)",
      defaults?.community_cta?.label ?? "Join the community"
    );
    const ctaHref =
      ctaLabel.length > 0
        ? await ask(
            rl,
            "Community CTA link",
            defaults?.community_cta?.href ?? "https://example.com/community"
          )
        : "";

    const theme: EscapeHatchTheme = {
      color_scheme,
      accent_color,
      paywall_style,
      type_pairing,
      gallery_density,
      cover_crop,
      paywall_message,
      hero: { title, subtitle, bio }
    };
    if (logo_path.length > 0) theme.logo_path = logo_path;
    if (ctaLabel.length > 0 && ctaHref.length > 0) {
      theme.community_cta = { label: ctaLabel, href: ctaHref };
    }
    return theme;
  } finally {
    rl.close();
  }
}
