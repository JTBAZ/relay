/**
 * Previewizer composition templates — v0 overlay registry.
 * Each template is a single full-bleed React overlay plus a photo recipe.
 */

import { createDefaultOverlayDocument, type OverlayDocument } from "./previewizer-overlay-layers";
import {
  type AspectRatioKey,
  type NormalizedRect,
  type PresetId
} from "./previewizer-presets";

export type CompositionTemplateId =
  | "blur_plug"
  | "bottom_blur_paywall"
  | "mystery_crop"
  | "cinematic_eyes"
  | "frosted_glass_card"
  | "collage_windows";

export type BlurPlugBlurType = "gaussian" | "pixelated" | "zoom" | "none";
export type BlurPlugPlatform = "patreon" | "deviantart" | "bluesky" | "twitter";
export type BlurPlugRevealShape = "none" | "circle" | "rect" | "diamond";
export type BlurPlugBorderEffect =
  | "frame"
  | "film"
  | "glow"
  | "brackets"
  | "vignette"
  | "confetti";
/** @deprecated Prefer borderStyles — kept for migration typing only. */
export type BlurPlugBorderStyle = BlurPlugBorderEffect | "none";
/** Censor stamp style (no "none" — absence = empty stamps array). */
export type BlurPlugStampStyle =
  | "members_only"
  | "eighteen_plus"
  | "blank_bar"
  | "nsfw";

/** Stamp text fonts — reuse Previewizer display stacks where possible. */
export type BlurPlugStampFont =
  | "system"
  | "impact"
  | "condensed"
  | "mono"
  | "editorial";

/** NSFW stamp look presets (on-canvas chips 1–5). */
export type BlurPlugNsfwVariant =
  | "alert"
  | "blackout"
  | "hazard"
  | "neon"
  | "ink";

/** 18+ stamp look presets (on-canvas chips 1–5). */
export type BlurPlugEighteenVariant =
  | "classic"
  | "crimson"
  | "badge"
  | "mature"
  | "outline";

export type BlurPlugStampVariant = BlurPlugNsfwVariant | BlurPlugEighteenVariant;

export type BlurPlugStamp = {
  id: string;
  style: BlurPlugStampStyle;
  /** Position in preview space 0–100. */
  x: number;
  y: number;
  /** Scale 8–100. */
  size: number;
  /** Rotation degrees −45…45. */
  rotation: number;
  font: BlurPlugStampFont;
  /** Style-scoped plate look (NSFW or 18+) — ignored for other stamp styles. */
  variant?: BlurPlugStampVariant;
};

/** Free-placed destination QR (stamp-like; not attached to the handle lockup). */
export type BlurPlugQrSize = "small" | "medium" | "large";

export type BlurPlugQrStamp = {
  enabled: boolean;
  /** Position in preview space 0–100 (center of badge). */
  x: number;
  y: number;
  size: BlurPlugQrSize;
};

/** Selection / drag id for the Blur Plug QR layer (not a censor stamp). */
export const BLUR_PLUG_QR_LAYER_ID = "blur-plug-qr";

export const DEFAULT_BLUR_PLUG_QR_STAMP: BlurPlugQrStamp = {
  enabled: true,
  x: 84,
  y: 86,
  size: "medium"
};

export const BLUR_PLUG_QR_SIZES: { id: BlurPlugQrSize; label: string }[] = [
  { id: "small", label: "S" },
  { id: "medium", label: "M" },
  { id: "large", label: "L" }
];

export function normalizeBlurPlugQrStamp(
  stamp: Partial<BlurPlugQrStamp> | null | undefined
): BlurPlugQrStamp {
  return {
    enabled: stamp?.enabled ?? DEFAULT_BLUR_PLUG_QR_STAMP.enabled,
    x: Math.max(0, Math.min(100, stamp?.x ?? DEFAULT_BLUR_PLUG_QR_STAMP.x)),
    y: Math.max(0, Math.min(100, stamp?.y ?? DEFAULT_BLUR_PLUG_QR_STAMP.y)),
    size: stamp?.size ?? DEFAULT_BLUR_PLUG_QR_STAMP.size
  };
}

export type BlurPlugTextSize = "xsmall" | "small" | "medium" | "large";
export type BlurPlugAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type BlurPlugProps = {
  blurType: BlurPlugBlurType;
  platform: BlurPlugPlatform;
  handle: string;
  label: string;
  anchor: BlurPlugAnchor;
  revealShape: BlurPlugRevealShape;
  revealSize: number;
  revealX: number;
  revealY: number;
  revealFeather: number;
  /** Crisp reveal layer opacity 0–100. */
  revealOpacity: number;
  /** Active border effects — multiple can be on at once. */
  borderStyles: BlurPlugBorderEffect[];
  /** Placeable censor stamps (simple layer list). */
  stamps: BlurPlugStamp[];
  /** Free-placed destination QR stamp. */
  qrStamp: BlurPlugQrStamp;
  labelSize: BlurPlugTextSize;
  handleSize: BlurPlugTextSize;
  /** Mosaic cell size in CSS px when blurType is pixelated (8–48). */
  pixelSize: number;
  /** Blur / mosaic effect opacity 0–100 (gaussian & pixelated). */
  blurOpacity: number;
  /** Vignette clear-center size 0–100 when vignette is active. */
  vignetteSize: number;
  /** Vignette edge darkness 0–100 when vignette is active. */
  vignetteIntensity: number;
  /** Inner glow hue 0–360 when glow is active. */
  glowHue: number;
};

export type BottomBlurPaywallProps = {
  headline: string;
  body: string;
  cta: string;
};

export type MysteryCropProps = {
  line1: string;
  line2: string;
  line3: string;
  platformUrl: string;
  lockupScale: MysteryCropLockupScale;
};

export type MysteryCropLockupScale = "small" | "medium" | "large";

export type CinematicEyesBarScale = "small" | "medium" | "large";

export type CinematicEyesProps = {
  headline: string;
  platformUrl: string;
  vignetteIntensity: number;
  vignetteRadius: number;
  barScale: CinematicEyesBarScale;
};

export type FrostedGlassCardScale = "small" | "medium" | "large";

export type FrostedGlassCardProps = {
  label: string;
  cta: string;
  glassScale: FrostedGlassCardScale;
  glassOpacity: number;
  backgroundDim: number;
};

export type CollageWindowsProps = {
  cta: string;
  platformUrl: string;
  accentHue: number;
};

export type CompositionPropsById = {
  blur_plug: BlurPlugProps;
  bottom_blur_paywall: BottomBlurPaywallProps;
  mystery_crop: MysteryCropProps;
  cinematic_eyes: CinematicEyesProps;
  frosted_glass_card: FrostedGlassCardProps;
  collage_windows: CollageWindowsProps;
};

export type CompositionContentSlot = {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
};

export type CompositionTemplateMeta = {
  id: CompositionTemplateId;
  label: string;
  description: string;
  aspectKey: AspectRatioKey;
  badge: string;
};

export type CompositionPhotoRecipe = {
  preset: PresetId;
  selection: NormalizedRect;
};

export type CompositionVariant<T extends CompositionTemplateId = CompositionTemplateId> = {
  label: string;
  props: Partial<CompositionPropsById[T]>;
  /** Optional aspect switch applied with the preset (layout-only templates). */
  aspectKey?: AspectRatioKey;
};

export type CompositionVariantAccent = "purple-teal" | "orange" | "patreon";

export const COMPOSITION_VARIANTS: {
  [K in CompositionTemplateId]: CompositionVariant<K>[];
} = {
  blur_plug: [
    {
      label: "A",
      aspectKey: "1:1",
      props: {
        labelSize: "large",
        handleSize: "small",
        anchor: "bottom-center"
      }
    },
    {
      label: "B",
      aspectKey: "9:16",
      props: {
        labelSize: "large",
        handleSize: "small",
        anchor: "bottom-left"
      }
    },
    {
      label: "C",
      aspectKey: "4:5",
      props: {
        labelSize: "medium",
        handleSize: "medium",
        anchor: "middle-center"
      }
    }
  ],
  bottom_blur_paywall: [
    {
      label: "Default",
      props: { headline: "Full access!", body: "", cta: "SEE FULL ART" }
    },
    {
      label: "With body",
      props: {
        headline: "Unlock this piece",
        body: "Join on Patreon to get full resolution art and exclusive WIPs.",
        cta: "SUPPORT ON PATREON"
      }
    },
    {
      label: "Short CTA",
      props: {
        headline: "Members only ✦",
        body: "This artwork is exclusive to Patreon supporters.",
        cta: "JOIN NOW"
      }
    }
  ],
  mystery_crop: [
    {
      label: "Default",
      props: {
        line1: "FULL",
        line2: "IMAGE",
        line3: "INSIDE",
        platformUrl: "PATREON.COM/YOU"
      }
    },
    {
      label: "Exclusive",
      props: {
        line1: "SEE THE",
        line2: "FULL",
        line3: "ARTWORK",
        platformUrl: "PATREON.COM/ARTIST"
      }
    },
    {
      label: "Members",
      props: {
        line1: "MEMBERS",
        line2: "ONLY",
        line3: "ACCESS",
        platformUrl: "PATREON.COM/STUDIO"
      }
    }
  ],
  cinematic_eyes: [
    {
      label: "Default",
      props: { headline: "See the Full Image", platformUrl: "Patreon.com/you" }
    },
    {
      label: "Exclusive",
      props: { headline: "Unlock Exclusive Art", platformUrl: "Patreon.com/artist" }
    },
    {
      label: "Members",
      props: { headline: "Members Only Content", platformUrl: "Patreon.com/studio" }
    }
  ],
  frosted_glass_card: [
    { label: "Default", props: { label: "Premium Content", cta: "SEE FULL ART" } },
    { label: "Exclusive", props: { label: "Exclusive Artwork", cta: "UNLOCK NOW" } },
    { label: "Members", props: { label: "Members Only", cta: "JOIN PATREON" } }
  ],
  collage_windows: [
    { label: "Default", props: { cta: "SEE FULL ART", platformUrl: "patreon.com/you" } },
    { label: "Unlock", props: { cta: "UNLOCK NOW", platformUrl: "patreon.com/artist" } },
    { label: "Join", props: { cta: "JOIN PATREON", platformUrl: "patreon.com/studio" } }
  ]
};

const VARIANT_ACCENT: Record<CompositionTemplateId, CompositionVariantAccent> = {
  blur_plug: "purple-teal",
  bottom_blur_paywall: "purple-teal",
  mystery_crop: "orange",
  cinematic_eyes: "patreon",
  frosted_glass_card: "purple-teal",
  collage_windows: "purple-teal"
};

export type AppliedCompositionTemplate<T extends CompositionTemplateId = CompositionTemplateId> = {
  compositionId: T;
  compositionProps: CompositionPropsById[T];
  preset: PresetId;
  selection: NormalizedRect;
  aspectKey: AspectRatioKey;
  overlayDoc: OverlayDocument;
};

export const DEFAULT_COMPOSITION_PROPS: CompositionPropsById = {
  blur_plug: {
    blurType: "none",
    platform: "patreon",
    handle: "patreon.com/user",
    label: "Follow me on",
    anchor: "bottom-center",
    revealShape: "none",
    revealSize: 26,
    revealX: 50,
    revealY: 42,
    revealFeather: 0,
    revealOpacity: 100,
    borderStyles: [],
    stamps: [],
    qrStamp: { ...DEFAULT_BLUR_PLUG_QR_STAMP },
    labelSize: "medium",
    handleSize: "medium",
    pixelSize: 18,
    blurOpacity: 100,
    vignetteSize: 50,
    vignetteIntensity: 55,
    glowHue: 262
  },
  bottom_blur_paywall: {
    headline: "Full access!",
    body: "",
    cta: "SEE FULL ART"
  },
  mystery_crop: {
    line1: "FULL",
    line2: "IMAGE",
    line3: "INSIDE",
    platformUrl: "PATREON.COM/YOU",
    lockupScale: "small"
  },
  cinematic_eyes: {
    headline: "See the Full Image",
    platformUrl: "Patreon.com/you",
    vignetteIntensity: 55,
    vignetteRadius: 50,
    barScale: "small"
  },
  frosted_glass_card: {
    label: "Premium Content",
    cta: "SEE FULL ART",
    glassScale: "small",
    glassOpacity: 100,
    backgroundDim: 0
  },
  collage_windows: {
    cta: "SEE FULL ART",
    platformUrl: "patreon.com/you",
    accentHue: 224
  }
};

const PHOTO_RECIPES: Record<CompositionTemplateId, CompositionPhotoRecipe> = {
  blur_plug: {
    preset: "tight_crop",
    // Default 4:5 window on a typical portrait source — reshaped on aspect change
    selection: { x: 0.12, y: 0.08, w: 0.76, h: 0.84 }
  },
  bottom_blur_paywall: {
    preset: "tight_crop",
    selection: { x: 0.15, y: 0, w: 0.7, h: 0.55 }
  },
  mystery_crop: {
    preset: "tight_crop",
    selection: { x: 0.45, y: 0.05, w: 0.55, h: 0.5 }
  },
  cinematic_eyes: {
    preset: "tight_crop",
    selection: { x: 0.2, y: 0.15, w: 0.6, h: 0.35 }
  },
  frosted_glass_card: {
    preset: "tight_crop",
    selection: { x: 0.15, y: 0, w: 0.7, h: 0.65 }
  },
  collage_windows: {
    preset: "tight_crop",
    selection: { x: 0.1, y: 0.05, w: 0.8, h: 0.75 }
  }
};

const CONTENT_SLOTS: Record<CompositionTemplateId, CompositionContentSlot[]> = {
  blur_plug: [
    { key: "label", label: "Label text", placeholder: "Follow me on" },
    { key: "handle", label: "Handle / URL", placeholder: "patreon.com/user" }
  ],
  bottom_blur_paywall: [
    { key: "headline", label: "Headline", placeholder: "Full access!" },
    { key: "body", label: "Body", multiline: true, placeholder: "Optional supporting text" },
    { key: "cta", label: "Button", placeholder: "SEE FULL ART" }
  ],
  mystery_crop: [
    { key: "line1", label: "Line 1", placeholder: "FULL" },
    { key: "line2", label: "Line 2", placeholder: "IMAGE" },
    { key: "line3", label: "Line 3", placeholder: "INSIDE" },
    { key: "platformUrl", label: "Platform URL", placeholder: "PATREON.COM/YOU" }
  ],
  cinematic_eyes: [
    { key: "headline", label: "Headline", placeholder: "See the Full Image" },
    { key: "platformUrl", label: "Platform URL", placeholder: "Patreon.com/you" }
  ],
  frosted_glass_card: [
    { key: "label", label: "Label", placeholder: "Premium Content" },
    { key: "cta", label: "Button", placeholder: "SEE FULL ART" }
  ],
  collage_windows: [
    { key: "cta", label: "Button", placeholder: "SEE FULL ART" },
    { key: "platformUrl", label: "Platform URL", placeholder: "patreon.com/you" }
  ]
};

export const COMPOSITION_TEMPLATES: CompositionTemplateMeta[] = [
  {
    id: "blur_plug",
    label: "Blur Plug",
    description: "Master blur teaser with platform lockup, reveal window, and border effects.",
    aspectKey: "4:5",
    badge: "Flexible · Master"
  },
  {
    id: "bottom_blur_paywall",
    label: "Bottom Blur Paywall",
    description: "Blurred lower half with centered Patreon stack and gradient CTA.",
    aspectKey: "4:5",
    badge: "4:5 · Paywall"
  },
  {
    id: "mystery_crop",
    label: "Mystery Crop",
    description: "Left scrim with speed streaks and bold teaser headline.",
    aspectKey: "1:1",
    badge: "1:1 · Crop"
  },
  {
    id: "cinematic_eyes",
    label: "Cinematic Eyes",
    description: "Eye-band vignette with serif headline on a black bar.",
    aspectKey: "1:1",
    badge: "1:1 · Eyes"
  },
  {
    id: "frosted_glass_card",
    label: "Frosted Glass Card",
    description: "Center glass card with Patreon wordmark and gradient button.",
    aspectKey: "4:5",
    badge: "4:5 · Glass"
  },
  {
    id: "collage_windows",
    label: "Collage Windows",
    description: "Navy frame with five tilted window cutouts revealing the art.",
    aspectKey: "4:5",
    badge: "4:5 · Collage"
  }
];

/** Frontend entry: only Blur Plug is offered. Other templates stay registered for asset reuse. */
export const ACTIVE_COMPOSITION_TEMPLATE_IDS: readonly CompositionTemplateId[] = ["blur_plug"];

export const ACTIVE_COMPOSITION_TEMPLATES: CompositionTemplateMeta[] = COMPOSITION_TEMPLATES.filter(
  (t) => ACTIVE_COMPOSITION_TEMPLATE_IDS.includes(t.id)
);

export const DEFAULT_ACTIVE_COMPOSITION_ID: CompositionTemplateId = "blur_plug";

export function getCompositionTemplateMeta(id: CompositionTemplateId): CompositionTemplateMeta {
  const meta = COMPOSITION_TEMPLATES.find((t) => t.id === id);
  if (!meta) throw new Error(`Unknown composition template: ${id}`);
  return meta;
}

export function getCompositionPhotoRecipe(id: CompositionTemplateId): CompositionPhotoRecipe {
  return PHOTO_RECIPES[id];
}

export function getCompositionContentSlots(id: CompositionTemplateId): CompositionContentSlot[] {
  return CONTENT_SLOTS[id];
}

export function getCompositionDrawerContentSlots(id: CompositionTemplateId): CompositionContentSlot[] {
  const slots = CONTENT_SLOTS[id];
  if (id === "mystery_crop" || id === "cinematic_eyes") {
    return slots.filter((slot) => slot.key !== "platformUrl");
  }
  return slots;
}

export function getCompositionPlatformUrlSlot(
  id: CompositionTemplateId
): CompositionContentSlot | null {
  if (id === "collage_windows") return null;
  return CONTENT_SLOTS[id].find((slot) => slot.key === "platformUrl") ?? null;
}

export const CINEMATIC_EYES_BAR_SCALES: { id: CinematicEyesBarScale; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" }
];

export const MYSTERY_CROP_LOCKUP_SCALES: { id: MysteryCropLockupScale; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" }
];

export const FROSTED_GLASS_CARD_SCALES: { id: FrostedGlassCardScale; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" }
];

export const BLUR_PLUG_BLUR_TYPES: { id: BlurPlugBlurType; label: string }[] = [
  { id: "none", label: "None (Reveal)" },
  { id: "gaussian", label: "Gaussian" },
  { id: "pixelated", label: "Pixelated" },
  { id: "zoom", label: "Blur + Zoom" }
];

export const BLUR_PLUG_PLATFORMS: { id: BlurPlugPlatform; label: string; handle: string }[] = [
  { id: "patreon", label: "Patreon", handle: "patreon.com/user" },
  { id: "deviantart", label: "DeviantArt", handle: "deviantart.com/user" },
  { id: "twitter", label: "Twitter", handle: "x.com/user" },
  { id: "bluesky", label: "Bluesky", handle: "user.bsky.social" }
];

export const BLUR_PLUG_REVEAL_SHAPES: { id: BlurPlugRevealShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rect", label: "Rectangle" },
  { id: "diamond", label: "Diamond" },
  { id: "none", label: "None" }
];

export const BLUR_PLUG_BORDER_STYLES: { id: BlurPlugBorderEffect; label: string }[] = [
  { id: "frame", label: "Frame" },
  { id: "film", label: "Film Strip" },
  { id: "glow", label: "Inner Glow" },
  { id: "brackets", label: "Corner Brackets" },
  { id: "vignette", label: "Vignette" },
  { id: "confetti", label: "Confetti" }
];

export const BLUR_PLUG_STAMP_STYLES: { id: BlurPlugStampStyle; label: string }[] = [
  { id: "members_only", label: "Members Only" },
  { id: "eighteen_plus", label: "18+" },
  { id: "nsfw", label: "NSFW" },
  { id: "blank_bar", label: "Blank bar" }
];

export const BLUR_PLUG_STAMP_FONTS: { id: BlurPlugStampFont; label: string }[] = [
  { id: "system", label: "System" },
  { id: "impact", label: "Bold Display" },
  { id: "condensed", label: "Condensed" },
  { id: "mono", label: "Mono" },
  { id: "editorial", label: "Classic" }
];

export const BLUR_PLUG_NSFW_VARIANTS: {
  id: BlurPlugNsfwVariant;
  label: string;
  swatch: string;
}[] = [
  { id: "alert", label: "Alert", swatch: "#8c1414" },
  { id: "blackout", label: "Blackout", swatch: "#0a0a0a" },
  { id: "hazard", label: "Hazard", swatch: "#eab308" },
  { id: "neon", label: "Neon", swatch: "#ec4899" },
  { id: "ink", label: "Ink", swatch: "#7f1d1d" }
];

export const BLUR_PLUG_EIGHTEEN_VARIANTS: {
  id: BlurPlugEighteenVariant;
  label: string;
  swatch: string;
}[] = [
  { id: "classic", label: "Classic", swatch: "#0a0a0a" },
  { id: "crimson", label: "Crimson", swatch: "#dc2626" },
  { id: "badge", label: "Heart", swatch: "#ff2d78" },
  { id: "mature", label: "Mature", swatch: "#111827" },
  { id: "outline", label: "Outline", swatch: "#f3f4f6" }
];

export const BLUR_PLUG_STAMP_FONT_STACKS: Record<BlurPlugStampFont, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  impact: "var(--font-bebas-neue, 'Bebas Neue'), Impact, 'Arial Black', sans-serif",
  condensed: "'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif",
  mono: "'Courier New', Courier, monospace",
  editorial: "var(--font-playfair, 'Playfair Display'), Georgia, 'Times New Roman', serif"
};

export function createBlurPlugStamp(
  style: BlurPlugStampStyle,
  index = 0
): BlurPlugStamp {
  const offset = (index % 5) * 4;
  return {
    id: `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    style,
    x: Math.min(88, 50 + offset),
    y: Math.min(88, 42 + offset),
    size: 28,
    rotation: style === "nsfw" ? -6 : -8,
    font: style === "eighteen_plus" || style === "nsfw" ? "impact" : "system",
    variant:
      style === "nsfw" ? "alert" : style === "eighteen_plus" ? "classic" : undefined
  };
}

export function updateBlurPlugStamp(
  stamps: BlurPlugStamp[],
  id: string,
  patch: Partial<Omit<BlurPlugStamp, "id">>
): BlurPlugStamp[] {
  return stamps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function removeBlurPlugStamp(stamps: BlurPlugStamp[], id: string): BlurPlugStamp[] {
  return stamps.filter((s) => s.id !== id);
}

export function toggleBlurPlugBorderStyle(
  current: BlurPlugBorderEffect[],
  next: BlurPlugBorderEffect
): BlurPlugBorderEffect[] {
  return current.includes(next) ? current.filter((s) => s !== next) : [...current, next];
}

export const BLUR_PLUG_TEXT_SIZES: { id: Exclude<BlurPlugTextSize, "xsmall">; label: string }[] = [
  { id: "small", label: "S" },
  { id: "medium", label: "M" },
  { id: "large", label: "L" }
];

export const BLUR_PLUG_HANDLE_SIZES: { id: BlurPlugTextSize; label: string }[] = [
  { id: "xsmall", label: "XS" },
  { id: "small", label: "S" },
  { id: "medium", label: "M" },
  { id: "large", label: "L" }
];

export const BLUR_PLUG_ANCHORS: BlurPlugAnchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
];

export function compositionAllowsAspectSwitch(id: CompositionTemplateId | null): boolean {
  return id === null || id === "blur_plug";
}

export function getDefaultCompositionProps<T extends CompositionTemplateId>(
  id: T
): CompositionPropsById[T] {
  return { ...DEFAULT_COMPOSITION_PROPS[id] };
}

export function applyCompositionTemplate<T extends CompositionTemplateId>(
  compositionId: T,
  partialProps: Partial<CompositionPropsById[T]> = {}
): AppliedCompositionTemplate<T> {
  const meta = getCompositionTemplateMeta(compositionId);
  const recipe = getCompositionPhotoRecipe(compositionId);
  const compositionProps = {
    ...DEFAULT_COMPOSITION_PROPS[compositionId],
    ...partialProps
  } as CompositionPropsById[T];

  return {
    compositionId,
    compositionProps,
    preset: recipe.preset,
    selection: { ...recipe.selection },
    aspectKey: meta.aspectKey,
    overlayDoc: createDefaultOverlayDocument()
  };
}

/** Switch active composition — always resets props and photo recipe to template defaults. */
export function switchCompositionTemplate<T extends CompositionTemplateId>(
  compositionId: T
): AppliedCompositionTemplate<T> {
  return applyCompositionTemplate(compositionId);
}

export function getCompositionFraming(compositionId: CompositionTemplateId): CompositionPhotoRecipe {
  return {
    preset: PHOTO_RECIPES[compositionId].preset,
    selection: { ...PHOTO_RECIPES[compositionId].selection }
  };
}

export function getCompositionVariants<T extends CompositionTemplateId>(
  id: T
): CompositionVariant<T>[] {
  return COMPOSITION_VARIANTS[id];
}

export function getCompositionVariantAccent(id: CompositionTemplateId): CompositionVariantAccent {
  return VARIANT_ACCENT[id];
}

export function getCompositionVariantProps<T extends CompositionTemplateId>(
  id: T,
  variantIndex: number
): CompositionPropsById[T] {
  const variants = COMPOSITION_VARIANTS[id];
  const variant = variants[variantIndex];
  if (!variant) throw new Error(`Unknown variant index ${variantIndex} for ${id}`);
  return {
    ...DEFAULT_COMPOSITION_PROPS[id],
    ...variant.props
  } as CompositionPropsById[T];
}

function variantPropsMatch(
  props: CompositionPropsById[CompositionTemplateId],
  variantProps: Partial<CompositionPropsById[CompositionTemplateId]>
): boolean {
  return Object.entries(variantProps).every(
    ([key, value]) => props[key as keyof typeof props] === value
  );
}

export function getCompositionVariantPatch<T extends CompositionTemplateId>(
  id: T,
  variantIndex: number
): Partial<CompositionPropsById[T]> {
  const variant = COMPOSITION_VARIANTS[id][variantIndex];
  if (!variant) throw new Error(`Unknown variant index ${variantIndex} for ${id}`);
  return variant.props;
}

export function getCompositionVariantAspectKey(
  id: CompositionTemplateId,
  variantIndex: number
): AspectRatioKey | null {
  return COMPOSITION_VARIANTS[id][variantIndex]?.aspectKey ?? null;
}

export function findCompositionVariantIndex(
  compositionId: CompositionTemplateId,
  props: CompositionPropsById[CompositionTemplateId]
): number | null {
  const variants = COMPOSITION_VARIANTS[compositionId];
  const idx = variants.findIndex((variant) => variantPropsMatch(props, variant.props));
  return idx >= 0 ? idx : null;
}
