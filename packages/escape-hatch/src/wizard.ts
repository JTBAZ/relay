/**
 * Interactive CLI wizard → EscapeHatchTheme (Designer-aligned tokens).
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ColorScheme, EscapeHatchTheme, PaywallStyle } from "./types.js";

const SCHEMES: ColorScheme[] = ["dark", "light", "warm"];
const ACCENTS = [
  "#5865f2",
  "#57f287",
  "#eb459e",
  "#ed4245",
  "#fee75c",
  "#00a8fc"
];
const PAYWALLS: PaywallStyle[] = ["blur", "hard", "teaser"];

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
      "Hero title",
      defaults?.hero?.title ?? "My Gallery"
    );
    const subtitle = await ask(
      rl,
      "Hero subtitle",
      defaults?.hero?.subtitle ?? "Independent membership gallery"
    );
    const bio = await ask(
      rl,
      "Hero bio",
      defaults?.hero?.bio ?? "Art and tiers you own."
    );

    const pwDefault = defaults?.paywall_style ?? "blur";
    const pwRaw = await ask(
      rl,
      `Paywall style (${PAYWALLS.join("|")})`,
      pwDefault
    );
    const paywall_style = (PAYWALLS.includes(pwRaw as PaywallStyle)
      ? pwRaw
      : pwDefault) as PaywallStyle;

    return {
      color_scheme,
      accent_color,
      paywall_style,
      hero: { title, subtitle, bio }
    };
  } finally {
    rl.close();
  }
}
