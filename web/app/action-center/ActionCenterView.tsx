"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  BookMarked,
  ChevronRight,
  Compass,
  CornerDownRight,
  ExternalLink,
  Eye,
  Flag,
  Globe,
  Images,
  Layers,
  MessageSquare,
  Minus,
  MoreVertical,
  PenLine,
  Plus,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  type LucideIcon
} from "lucide-react";
import {
  RELAY_API_BASE,
  buildGalleryQuery,
  fetchActionCenterCards,
  fetchAnalyticsHealth,
  postActionCenterAccept,
  postActionCenterDismiss,
  postAnalyticsGenerate,
  relayFetch,
  type ActionCenterCard,
  type AnalyticsHealthData,
  type GalleryItem,
  type GalleryListData
} from "@/lib/relay-api";
import { useStudioSession } from "@/lib/studio-session-context";
import { CreatorPublicUrlSettings } from "@/app/components/studio/CreatorPublicUrlSettings";

type ActiveSection = "discovery" | "community" | "gallery" | "insights";
type DrawerKind = "inbox" | "moderation" | null;
type DiscoveryDrawerKind = "impressions" | "conversions" | null;
type PromoTrend = "up" | "down" | "flat";
type CampaignGoal = "acquire" | "upsell" | "reactivate" | "niche";
type ContentOffer = "preview" | "partial_blur" | "free_cta" | "first_free_second_locked";

type CampaignStrategy = {
  goal: CampaignGoal;
  discount: number;
  contentOffer: ContentOffer;
};

type DiscountCode = {
  id: number;
  percent: number;
  code: string;
};

type PromoPiece = {
  id: number;
  rank: number;
  title: string;
  type: "photo" | "writing" | "audio";
  postId?: string;
  mediaId?: string;
  imageSrc?: string | null;
  metrics?: {
    impressions: number;
    conversions: number;
    tipRevenue: number;
    trend: PromoTrend;
    trendValue: number;
  };
  strategy?: CampaignStrategy;
};

type CommunityItem = {
  id: number;
  type: "comment" | "reply" | "report";
  user: string;
  content: string;
  target: string;
  time: string;
  read: boolean;
};

type ManagedPostComment = {
  id: number;
  user: string;
  body: string;
  time: string;
  x: number;
  y: number;
};

type ManagedGalleryPost = {
  id: number;
  title: string;
  excerpt: string;
  thumbnailTone: string;
  publishedAt: string;
  /** Minutes since latest comment; lower = more recent. Used for "Latest comment" sort. */
  latestCommentRecencyMinutes: number;
  /** Approx. age of post for "Recency" sort; lower = published more recently. */
  publishedAgeMinutes: number;
  latestCommentAt: string;
  metrics: {
    views: number;
    favorites: number;
    collections: number;
  };
  comments: ManagedPostComment[];
};

const DEFAULT_CAMPAIGN_STRATEGY: CampaignStrategy = {
  goal: "acquire",
  discount: 20,
  contentOffer: "preview"
};

const DEFAULT_DISCOUNT_CODES: DiscountCode[] = [
  { id: 1, percent: 10, code: "" },
  { id: 2, percent: 15, code: "" },
  { id: 3, percent: 30, code: "" },
  { id: 4, percent: 50, code: "" }
];

const PROMO_PIECES: PromoPiece[] = [
  {
    id: 1,
    rank: 1,
    title: "Autumn Series No. 4",
    type: "photo",
    metrics: { impressions: 1842, conversions: 12, tipRevenue: 108, trend: "up", trendValue: 18 }
  },
  {
    id: 2,
    rank: 2,
    title: "On Silence & Digital Commons",
    type: "writing",
    metrics: { impressions: 1205, conversions: 9, tipRevenue: 63, trend: "up", trendValue: 7 }
  },
  {
    id: 3,
    rank: 3,
    title: "Studio Ambient Vol. 2",
    type: "audio",
    metrics: { impressions: 980, conversions: 6, tipRevenue: 78, trend: "flat", trendValue: 0 }
  },
  {
    id: 4,
    rank: 4,
    title: "Portrait Study III",
    type: "photo",
    metrics: { impressions: 744, conversions: 4, tipRevenue: 24, trend: "up", trendValue: 3 }
  },
  {
    id: 5,
    rank: 5,
    title: "Margins Essay",
    type: "writing",
    metrics: { impressions: 601, conversions: 3, tipRevenue: 13, trend: "down", trendValue: 5 }
  }
];

const COMMUNITY_FEED: CommunityItem[] = [
  {
    id: 1,
    type: "report",
    user: "anonymous",
    content: "Post flagged for review",
    target: "Autumn Series No. 4",
    time: "2m",
    read: false
  },
  {
    id: 2,
    type: "comment",
    user: "mara_osei",
    content: "This piece genuinely stopped me. The light is extraordinary.",
    target: "Portrait Study III",
    time: "14m",
    read: false
  },
  {
    id: 3,
    type: "reply",
    user: "james_liu",
    content: "Replied to your comment",
    target: "On Silence & Digital Commons",
    time: "1h",
    read: false
  },
  {
    id: 4,
    type: "comment",
    user: "riley_k",
    content: "Any chance of a print run?",
    target: "Autumn Series No. 4",
    time: "5h",
    read: true
  }
];

const MANAGED_GALLERY_POSTS: ManagedGalleryPost[] = [
  {
    id: 1,
    title: "On Silence and the Digital Commons",
    excerpt: "Essay preview with support-tier discussion and pinned image comments.",
    thumbnailTone: "from-[oklch(0.48_0.06_15)] to-[oklch(0.68_0.08_25)]",
    publishedAt: "Today",
    publishedAgeMinutes: 60,
    latestCommentRecencyMinutes: 12,
    latestCommentAt: "12m ago",
    metrics: { views: 1842, favorites: 214, collections: 18 },
    comments: [
      { id: 1, user: "Sam K.", body: "The earpiece detail is doing so much work here.", time: "12m", x: 31, y: 57 },
      { id: 2, user: "Mara O.", body: "The contrast between quiet and infrastructure lands hard.", time: "28m", x: 58, y: 38 },
      { id: 3, user: "Riley K.", body: "Would love a longer note on the reference image.", time: "1h", x: 69, y: 72 }
    ]
  },
  {
    id: 2,
    title: "Autumn Series No. 4",
    excerpt: "High-performing gallery piece with active favorites and collections.",
    thumbnailTone: "from-[oklch(0.36_0.05_65)] to-[oklch(0.66_0.08_82)]",
    publishedAt: "Yesterday",
    publishedAgeMinutes: 30 * 60,
    latestCommentRecencyMinutes: 24,
    latestCommentAt: "24m ago",
    metrics: { views: 1604, favorites: 186, collections: 22 },
    comments: [
      { id: 4, user: "Elena V.", body: "This one feels like the center of the whole set.", time: "24m", x: 42, y: 44 },
      { id: 5, user: "James L.", body: "The warm edge lighting is beautiful.", time: "2h", x: 60, y: 61 }
    ]
  },
  {
    id: 3,
    title: "Portrait Study III",
    excerpt: "Supporter-only portrait study with a small moderation queue.",
    thumbnailTone: "from-[oklch(0.24_0.04_240)] to-[oklch(0.56_0.06_275)]",
    publishedAt: "3d ago",
    publishedAgeMinutes: 3 * 24 * 60,
    latestCommentRecencyMinutes: 120,
    latestCommentAt: "2h ago",
    metrics: { views: 744, favorites: 73, collections: 9 },
    comments: [
      { id: 6, user: "Nia P.", body: "The composition makes this feel ceremonial.", time: "2h", x: 48, y: 30 },
      { id: 7, user: "anon", body: "Flagged language could be reviewed here.", time: "3h", x: 72, y: 50 }
    ]
  },
  {
    id: 4,
    title: "Studio Ambient Vol. 2",
    excerpt: "Audio post with slower but steady repeat engagement.",
    thumbnailTone: "from-[oklch(0.18_0.03_155)] to-[oklch(0.43_0.08_185)]",
    publishedAt: "5d ago",
    publishedAgeMinutes: 5 * 24 * 60,
    latestCommentRecencyMinutes: 480,
    latestCommentAt: "8h ago",
    metrics: { views: 980, favorites: 91, collections: 12 },
    comments: [
      { id: 8, user: "Kai M.", body: "This loop has been on while I sketch.", time: "8h", x: 36, y: 66 }
    ]
  }
];

const CONVERSION_POST_ATTRIBUTION = [
  {
    title: "Autumn Series No. 4",
    subscribers: 12,
    leadingTier: "Archive tier",
    estimatedValue: "$108",
    share: "35%"
  },
  {
    title: "On Silence & Digital Commons",
    subscribers: 9,
    leadingTier: "Supporter tier",
    estimatedValue: "$63",
    share: "26%"
  },
  {
    title: "Studio Ambient Vol. 2",
    subscribers: 6,
    leadingTier: "Studio tier",
    estimatedValue: "$78",
    share: "18%"
  },
  {
    title: "Portrait Study III",
    subscribers: 4,
    leadingTier: "Supporter tier",
    estimatedValue: "$24",
    share: "12%"
  },
  {
    title: "Margins Essay",
    subscribers: 3,
    leadingTier: "Archive tier",
    estimatedValue: "$13",
    share: "9%"
  }
];

const ACTION_CENTER_THEME = {
  "--lib-bg": "oklch(0.115 0.006 240)",
  "--lib-card": "oklch(0.17 0.008 240)",
  "--lib-muted": "oklch(0.22 0.008 240)",
  "--lib-border": "oklch(0.255 0.009 240)",
  "--lib-fg": "oklch(0.9 0.006 235)",
  "--lib-fg-muted": "oklch(0.62 0.01 235)",
  "--lib-primary": "oklch(0.58 0.075 155)"
} as CSSProperties;

const CAMPAIGN_GOALS: Array<{ value: CampaignGoal; label: string; help: string }> = [
  {
    value: "acquire",
    label: "Acquire new patrons",
    help: "Prioritize likely buyers who are not currently subscribed."
  },
  {
    value: "upsell",
    label: "Upsell existing patrons",
    help: "Favor current patrons who may be ready for a higher tier or unlock."
  },
  {
    value: "reactivate",
    label: "Reactivate former patrons",
    help: "Reach people who used to support you and may respond to fresh work."
  },
  {
    value: "niche",
    label: "Grow a niche audience",
    help: "Expose pieces to people engaging with similar tags, themes, or creators."
  }
];

const CONTENT_OFFERS: Array<{ value: ContentOffer; label: string; help: string }> = [
  {
    value: "preview",
    label: "Default Preview",
    help: "Show the selected piece as a teaser with the normal subscribe or tip call to action."
  },
  {
    value: "partial_blur",
    label: "Partial Unblur",
    help: "Reveal enough to create interest while keeping the full piece gated."
  },
  {
    value: "free_cta",
    label: "Free + CTA",
    help: "Let likely patrons open this piece freely, then point them toward the paid gallery."
  },
  {
    value: "first_free_second_locked",
    label: "Partial Unlock",
    help: "For multi-image posts, show the first image and gate the next one as the conversion moment."
  }
];

function formatDeltaRange(metric: string, range: [number, number], horizon: number): string {
  const [a, b] = range;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  return `${metric}: ${sign(a)}${a} to ${sign(b)}${b} over ~${horizon}d`;
}

function inferPromoType(item: GalleryItem): PromoPiece["type"] {
  const mime = item.mime_type ?? "";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "writing";
  return "photo";
}

function dedupeGalleryPosts(items: GalleryItem[]): GalleryItem[] {
  const seen = new Set<string>();
  const rows: GalleryItem[] = [];
  for (const item of items) {
    if (seen.has(item.post_id)) continue;
    seen.add(item.post_id);
    rows.push(item);
  }
  return rows;
}

function galleryImageSrc(item: GalleryItem): string | null {
  const path = item.content_url_path || item.preview_url_path;
  return path ? `${RELAY_API_BASE}${path}` : null;
}

function piecePublicHref(piece: PromoPiece): string {
  if (!piece.postId) return "/visitor";
  return `/visitor?post_id=${encodeURIComponent(piece.postId)}`;
}

function SectionTabs({
  activeSection,
  onChange
}: {
  activeSection: ActiveSection;
  onChange: (section: ActiveSection) => void;
}) {
  const tabs: Array<{ id: ActiveSection; label: string; Icon: LucideIcon }> = [
    { id: "discovery", label: "Discovery", Icon: Compass },
    { id: "community", label: "Community", Icon: MessageSquare },
    { id: "gallery", label: "Manage Gallery", Icon: Images },
    { id: "insights", label: "Insights", Icon: BarChart3 }
  ];

  return (
    <nav className="flex items-center gap-2 overflow-x-auto" aria-label="Action Center sections">
      {tabs.map(({ id, label, Icon }) => {
        const active = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-[color-mix(in_srgb,var(--lib-primary)_55%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-bg))] text-[oklch(0.78_0.075_155)]"
                : "border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_82%,var(--lib-bg))] text-[var(--lib-fg-muted)] hover:border-[var(--lib-primary)]/45 hover:text-[var(--lib-fg)]"
            ].join(" ")}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function MockBadge() {
  return (
    <span className="rounded-full border border-[var(--lib-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
      Planned data
    </span>
  );
}

function CampaignStrategyPanel({
  selectedPiece,
  strategy,
  onStrategyChange,
  discountCodes,
  onManageDiscounts
}: {
  selectedPiece: PromoPiece | null;
  strategy: CampaignStrategy;
  onStrategyChange: (next: CampaignStrategy) => void;
  discountCodes: DiscountCode[];
  onManageDiscounts: () => void;
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const selectedGoal = CAMPAIGN_GOALS.find((g) => g.value === strategy.goal) ?? CAMPAIGN_GOALS[0];
  const selectedOffer = CONTENT_OFFERS.find((offer) => offer.value === strategy.contentOffer) ?? CONTENT_OFFERS[0];
  const connectedDiscountCount = discountCodes.filter((discount) => discount.code.trim()).length;

  const updateStrategy = (patch: Partial<CampaignStrategy>) => {
    setSaveMessage(null);
    onStrategyChange({ ...strategy, ...patch });
  };

  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--lib-primary)_28%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-card)_82%,var(--lib-bg))] p-4 shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--lib-primary)_35%,transparent)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_16%,var(--lib-bg))] text-[oklch(0.78_0.075_155)]">
              <Target size={15} aria-hidden />
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">
                Growth Strategy
              </h2>
              <p className="text-xs text-[var(--lib-fg-muted)]">
                {selectedPiece?.title ? `Editing: ${selectedPiece.title}` : "Select a campaign card to edit its strategy."}
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--lib-fg-muted)]">
            These rules apply to the selected Campaign card. Use them to compare offers, placement,
            and cycling behavior across pieces.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-xs text-[var(--lib-fg-muted)]">
            <span className="text-[var(--lib-fg)]">Promo budget:</span>{" "}
            <span title="Included in the creator's monthly Pro plan.">Pro included</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveMessage("Saved for this campaign card")}
            className="rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_16%,var(--lib-bg))] px-4 py-2 text-sm font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/70"
          >
            Save strategy
          </button>
          {saveMessage ? <span className="text-xs text-[oklch(0.72_0.075_155)]">{saveMessage}</span> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Monthly goal
          </span>
          <select
            value={strategy.goal}
            onChange={(event) => updateStrategy({ goal: event.target.value as CampaignGoal })}
            className="w-full rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2.5 text-sm text-[var(--lib-fg)] outline-none focus:border-[var(--lib-primary)]"
          >
            {CAMPAIGN_GOALS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-[var(--lib-fg-muted)]">{selectedGoal.help}</p>
        </label>

        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Offer
          </span>
          <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--lib-fg)]">I&apos;m comfortable with up to</span>
              <span className="text-xl font-semibold tabular-nums text-[oklch(0.76_0.09_82)]">
                {strategy.discount}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={strategy.discount}
              onChange={(event) => updateStrategy({ discount: Number(event.target.value) })}
              className="mt-3 w-full accent-[oklch(0.58_0.075_155)]"
              aria-label="Maximum first-month discount"
            />
            <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
              Maximum first-month discount code Relay may offer under this strategy.
            </p>
            <button
              type="button"
              onClick={onManageDiscounts}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_40%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-bg))] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/70"
            >
              Manage Discounts
              <span className="rounded-full bg-[var(--lib-bg)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                {connectedDiscountCount}/{discountCodes.length}
              </span>
            </button>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Preview Style
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTENT_OFFERS.map((offer) => {
              const active = strategy.contentOffer === offer.value;
              return (
                <button
                  key={offer.value}
                  type="button"
                  title={offer.help}
                  onClick={() => updateStrategy({ contentOffer: offer.value })}
                  className={[
                    "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-[color-mix(in_srgb,var(--lib-primary)_55%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_14%,var(--lib-bg))] text-[var(--lib-fg)]"
                      : "border-[var(--lib-border)] bg-[var(--lib-bg)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                  ].join(" ")}
                >
                  {offer.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-[var(--lib-fg-muted)]">{selectedOffer.help}</p>
        </fieldset>
      </div>
    </section>
  );
}

function DiscountCodesModal({
  codes,
  onChange,
  onClose
}: {
  codes: DiscountCode[];
  onChange: (codes: DiscountCode[]) => void;
  onClose: () => void;
}) {
  const updateCode = (id: number, code: string) => {
    onChange(codes.map((item) => (item.id === id ? { ...item, code } : item)));
  };

  const updatePercent = (id: number, percent: number) => {
    const normalized = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    onChange(codes.map((item) => (item.id === id ? { ...item, percent: normalized } : item)));
  };

  const addDiscountLevel = () => {
    const nextId = Math.max(0, ...codes.map((item) => item.id)) + 1;
    onChange([...codes, { id: nextId, percent: 0, code: "" }]);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close discount manager"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[81] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-bg)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--lib-border)] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.76_0.09_82)]">
              Global campaign settings
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--lib-fg)]">
              Manage Discounts
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--lib-fg-muted)]">
              Add the Patreon discount codes Relay can use for every campaign piece. Create a few
              global, non-expiring, Relay-specific codes so we can attach the code to promo links
              and track conversion performance.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <a
            href="https://www.patreon.com/promotions/discounts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_42%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_14%,var(--lib-bg))] px-4 py-2 text-sm font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/70"
          >
            Open Patreon Discounts
            <ExternalLink size={14} aria-hidden />
          </a>

          <div className="grid gap-3 sm:grid-cols-2">
            {codes.map((discount) => (
              <label
                key={discount.id}
                className="rounded-2xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_76%,var(--lib-bg))] p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discount.percent}
                    onChange={(event) => updatePercent(discount.id, Number(event.target.value))}
                    aria-label="Discount percent"
                    className="w-20 rounded-full border border-[color-mix(in_srgb,oklch(0.76_0.09_82)_35%,var(--lib-border))] bg-[var(--lib-bg)] px-2 py-1 text-xs font-medium text-[oklch(0.76_0.09_82)] outline-none focus:border-[oklch(0.76_0.09_82)]"
                  />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    percent code
                  </span>
                </div>
                <input
                  value={discount.code}
                  onChange={(event) => updateCode(discount.id, event.target.value)}
                  placeholder={`RELAY${discount.percent}`}
                  className="mt-3 w-full rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm uppercase tracking-wide text-[var(--lib-fg)] outline-none placeholder:text-[var(--lib-fg-muted)] focus:border-[var(--lib-primary)]"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={addDiscountLevel}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-sm text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/60"
          >
            <Plus size={14} aria-hidden />
            Add discount level
          </button>

          <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4 text-sm leading-6 text-[var(--lib-fg-muted)]">
            These codes are shared across all campaign items. Each selected campaign card still sets
            its own maximum discount cap; Relay will only use connected codes at or below that cap.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  Icon,
  urgent = false,
  onClick
}: {
  label: string;
  value: number;
  delta?: number;
  Icon: LucideIcon;
  urgent?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "flex min-h-[104px] flex-col items-start rounded-xl border p-4 text-left transition-colors",
        urgent
          ? "border-[oklch(0.52_0.16_35)] bg-[color-mix(in_srgb,oklch(0.22_0.08_35)_45%,var(--lib-card))]"
          : "border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_88%,var(--lib-bg))]",
        onClick ? "hover:border-[var(--lib-primary)]/50" : ""
      ].join(" ")}
    >
      <div className="mb-2 flex w-full items-center justify-between">
        <Icon size={16} aria-hidden className={urgent ? "text-[oklch(0.72_0.15_35)]" : "text-[var(--lib-primary)]"} />
        {delta && delta > 0 ? (
          <span className="text-xs text-[var(--lib-fg-muted)]">+{delta}</span>
        ) : null}
      </div>
      <span className={["text-2xl font-semibold tabular-nums", urgent ? "text-[oklch(0.78_0.15_35)]" : "text-[var(--lib-fg)]"].join(" ")}>
        {value.toLocaleString()}
      </span>
      <span className="mt-1 text-xs text-[var(--lib-fg-muted)]">{label}</span>
    </Tag>
  );
}

function Drawer({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" aria-modal="true" role="dialog">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative z-[71] flex h-full w-full max-w-md flex-col overflow-hidden border-l border-[var(--lib-border)] bg-[var(--lib-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lib-border)] px-5 py-4">
          <span className="font-[family-name:var(--font-display)] text-base text-[var(--lib-fg)]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Trend({ trend, value }: { trend: PromoTrend; value: number }) {
  if (trend === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--lib-fg-muted)]" title="Maintaining across rolling average">
        <Minus size={12} aria-hidden /> 0%
      </span>
    );
  }
  const up = trend === "up";
  return (
      <span
        className={["inline-flex items-center gap-1 text-xs font-medium", up ? "text-[oklch(0.72_0.075_155)]" : "text-[oklch(0.72_0.12_65)]"].join(" ")}
        title={up ? "Growing across rolling average" : "Slowing across rolling average"}
      >
      {up ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
      {value}%
    </span>
  );
}

function PromoCard({
  piece,
  onAdd,
  onInspect,
  onSelect,
  onChangeMedia,
  isMenuOpen = false,
  onToggleMenu
}: {
  piece: PromoPiece;
  onAdd: (slotId: number) => void;
  onInspect: (slotId: number) => void;
  onSelect: (slotId: number) => void;
  onChangeMedia: (slotId: number) => void;
  isMenuOpen?: boolean;
  onToggleMenu: (slotId: number) => void;
}) {
  if (!piece.metrics) {
    return (
      <button
        type="button"
        onClick={() => onAdd(piece.id)}
        className="group flex h-[120px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--lib-border)] transition-colors hover:border-[var(--lib-primary)]/60 hover:bg-[var(--lib-card)]"
        aria-label={`Add promo, slot ${piece.rank}`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lib-card)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-card))]">
          <Plus size={20} aria-hidden className="text-[var(--lib-fg-muted)] group-hover:text-[var(--lib-primary)]" />
        </div>
        <span className="mt-2 text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">Slot {piece.rank}</span>
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(piece.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(piece.id);
        }
      }}
      className={[
        "group relative flex h-[136px] w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--lib-card)_90%,var(--lib-bg))] p-3 text-left transition-colors hover:border-[var(--lib-primary)]/50",
        "border-[var(--lib-border)]"
      ].join(" ")}
      aria-label={`Select campaign piece ${piece.rank}`}
    >
      <div className="pointer-events-none absolute inset-0">
        {piece.imageSrc ? (
          <>
            <img
              src={piece.imageSrc}
              alt=""
              className="absolute right-0 top-0 h-full w-[46%] object-cover opacity-55 transition-opacity group-hover:opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--lib-card)] via-[color-mix(in_srgb,var(--lib-card)_82%,transparent)] to-[color-mix(in_srgb,var(--lib-bg)_26%,transparent)]" />
          </>
        ) : (
          <div className="absolute right-3 top-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_58%,transparent)] text-[var(--lib-fg-muted)] opacity-55">
            <Images size={26} aria-hidden />
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label={`Open actions for ${piece.title}`}
        aria-expanded={isMenuOpen}
        onClick={(event) => {
          event.stopPropagation();
          onToggleMenu(piece.id);
        }}
        className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-bg)_72%,transparent)] text-[var(--lib-fg-muted)] opacity-80 backdrop-blur-sm transition-colors hover:border-[var(--lib-primary)]/50 hover:text-[var(--lib-fg)]"
      >
        <MoreVertical size={15} aria-hidden />
      </button>

      {isMenuOpen ? (
        <div
          className="absolute right-2 top-10 z-30 w-36 overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-bg)_92%,black)] p-1 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onInspect(piece.id)}
            className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-card)]"
          >
            Inspect
          </button>
          <button
            type="button"
            onClick={() => onChangeMedia(piece.id)}
            className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--lib-fg-muted)] hover:bg-[var(--lib-card)] hover:text-[var(--lib-fg)]"
          >
            Change media
          </button>
        </div>
      ) : null}

      <div className="relative z-10 mb-auto max-w-[72%]">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-[var(--lib-fg)]">{piece.title}</p>
      </div>

      <div className="relative z-10 mt-3 flex items-end justify-between border-t border-[color-mix(in_srgb,var(--lib-border)_75%,transparent)] pt-2">
        <div>
          <p className="text-xl font-semibold tabular-nums text-[var(--lib-fg)]">
            {piece.metrics.impressions.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[9px] text-[var(--lib-fg-muted)]">unique impressions</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-[oklch(0.78_0.075_82)] [text-shadow:0_0_0.5px_oklch(0.9_0.08_82),0_0_8px_color-mix(in_srgb,oklch(0.76_0.09_82)_18%,transparent)]">
            ${piece.metrics.tipRevenue.toLocaleString()}
          </span>
          <Trend trend={piece.metrics.trend} value={piece.metrics.trendValue} />
        </div>
      </div>
    </div>
  );
}

function DiscoveryPostPickerModal({
  creatorId,
  slotId,
  onClose,
  onSelect
}: {
  creatorId: string;
  slotId: number;
  onClose: () => void;
  onSelect: (slotId: number, item: GalleryItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const path = buildGalleryQuery({
        creator_id: creatorId,
        q: query.trim() || undefined,
        visibility: "visible",
        sort: "published",
        display: "post_primary",
        text_only_posts: "include",
        limit: 80
      });

      void relayFetch<GalleryListData>(path)
        .then((data) => {
          if (cancelled) return;
          setItems(dedupeGalleryPosts(data.items));
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
          setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [creatorId, query]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close Discovery piece picker"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[81] flex max-h-[min(88vh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-bg)] shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-[var(--lib-border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.76_0.09_82)]">
              Discovery slot {slotId}
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">
              Choose a Library post
            </h3>
            <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
              Select a visible post to insert into this Discovery Piece slot. This is local UI state until the backend workflow is wired.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="border-b border-[var(--lib-border)] px-5 py-4">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2">
            <Eye size={14} aria-hidden className="text-[var(--lib-fg-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Library posts..."
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--lib-fg)] outline-none placeholder:text-[var(--lib-fg-muted)]"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-[var(--lib-fg-muted)]">
              Loading Library posts...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-xl border border-[oklch(0.52_0.16_35)]/40 bg-[color-mix(in_srgb,oklch(0.22_0.08_35)_38%,var(--lib-card))] p-4 text-sm text-[var(--lib-fg)]">
              {error}
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-[var(--lib-border)] text-sm text-[var(--lib-fg-muted)]">
              No visible Library posts matched that search.
            </div>
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const imageSrc = galleryImageSrc(item);
                return (
                  <button
                    key={`${item.post_id}:${item.media_id}`}
                    type="button"
                    onClick={() => onSelect(slotId, item)}
                    className="group overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] text-left transition-colors hover:border-[var(--lib-primary)]/55"
                  >
                    <div className="aspect-[4/3] bg-[color-mix(in_srgb,var(--lib-muted)_70%,black)]">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt=""
                          className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--lib-fg-muted)]">
                          Text post
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm font-medium text-[var(--lib-fg)]">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">
                        {item.tier_ids.length > 0 ? <span>{item.tier_ids.length} tier gate</span> : <span>free</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DiscoveryPieceDetailModal({
  piece,
  onBack,
  onChangeMedia
}: {
  piece: PromoPiece;
  onBack: () => void;
  onChangeMedia: () => void;
}) {
  const metrics = piece.metrics ?? { impressions: 0, conversions: 0, tipRevenue: 0, trend: "flat" as const, trendValue: 0 };
  const tips = Math.max(0, Math.round(metrics.conversions * 1.7 + piece.rank));
  const comments = Math.max(0, Math.round(metrics.impressions * 0.012));
  const favorites = Math.max(0, Math.round(metrics.impressions * 0.018));
  const collections = Math.max(0, Math.round(metrics.impressions * 0.004));
  const pulseScore = Math.max(42, 88 - piece.rank * 4 - (metrics.trend === "down" ? 14 : 0));
  const cycleCopy =
    metrics.trend === "down"
      ? "Momentum is cooling. Recommend reviewing this piece within the next 7 days."
      : metrics.trend === "flat"
        ? "Performance is stable. Consider cycling out if it stays flat for another 10 days."
        : "Performance is still climbing. Keep this piece active for now.";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close Discovery piece detail"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
        onClick={onBack}
      />
      <div className="relative z-[81] flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-bg)] shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-[var(--lib-border)] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.76_0.09_82)]">
              Discovery piece {piece.rank}
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--lib-fg)]">
              {piece.title}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-[var(--lib-fg-muted)]">
              Inspect how this piece is performing in likely-patron feeds and decide whether to keep, visit, or swap it.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-3">
            <div className="min-w-28 rounded-xl bg-[var(--lib-bg)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">Tips to preview</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">{tips}</p>
            </div>
            <div className="min-w-28 rounded-xl bg-[var(--lib-bg)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">Conversions</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">{metrics.conversions}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Inspection</p>
                  <h4 className="mt-1 text-base font-semibold text-[var(--lib-fg)]">Global performance</h4>
                </div>
                <span className="rounded-full border border-[var(--lib-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">
                  Mock analytics
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <StatSummary label="Unique impressions" value={metrics.impressions.toLocaleString()} />
                <StatSummary label="Tip revenue" value={`$${metrics.tipRevenue.toLocaleString()}`} />
                <StatSummary label="Comments" value={String(comments)} />
                <StatSummary label="Favorites" value={String(favorites)} />
                <StatSummary label="Added to collections" value={String(collections)} />
              </div>

              <div className="mt-4 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Attribution notes</p>
                <p className="mt-2 text-sm leading-6 text-[var(--lib-fg-muted)]">
                  This piece is currently credited with {metrics.conversions} conversion
                  {metrics.conversions === 1 ? "" : "s"} and {tips} tip-to-preview unlock
                  {tips === 1 ? "" : "s"}. Future backend work will split this by feed placement,
                  audience segment, and pledge tier.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Pulse score</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="text-5xl font-semibold tabular-nums text-[var(--lib-fg)]">{pulseScore}</p>
                <p className="pb-2 text-sm text-[var(--lib-fg-muted)]">/ 100</p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--lib-bg)]">
                <div
                  className="h-full rounded-full bg-[color-mix(in_srgb,var(--lib-primary)_72%,oklch(0.76_0.09_82))]"
                  style={{ width: `${pulseScore}%` }}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--lib-fg-muted)]">{cycleCopy}</p>
              <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,oklch(0.76_0.09_82)_35%,var(--lib-border))] bg-[color-mix(in_srgb,oklch(0.22_0.04_82)_34%,var(--lib-card))] p-3">
                <p className="text-xs uppercase tracking-wide text-[oklch(0.76_0.09_82)]">Cycle-out window</p>
                <p className="mt-1 text-sm text-[var(--lib-fg)]">
                  Review after {metrics.trend === "down" ? "7" : metrics.trend === "flat" ? "10" : "14"} more days.
                </p>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_70%,var(--lib-bg))] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-sm text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          >
            Back
          </button>
          <Link
            href={piecePublicHref(piece)}
            className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-center text-sm text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50"
          >
            Go to Piece
          </Link>
          <button
            type="button"
            onClick={onChangeMedia}
            className="rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_50%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-bg))] px-4 py-2 text-sm font-medium text-[oklch(0.82_0.075_155)]"
          >
            Change Media
          </button>
        </div>
      </div>
    </div>
  );
}

function StatSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">{value}</p>
    </div>
  );
}

function DiscoverySection({ creatorId }: { creatorId: string }) {
  const [promoPieces, setPromoPieces] = useState<PromoPiece[]>(PROMO_PIECES);
  const [openDiscoveryDrawer, setOpenDiscoveryDrawer] = useState<DiscoveryDrawerKind>(null);
  const [pickerSlotId, setPickerSlotId] = useState<number | null>(null);
  const [activePieceId, setActivePieceId] = useState<number | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(PROMO_PIECES[0]?.id ?? null);
  const [openPieceMenuId, setOpenPieceMenuId] = useState<number | null>(null);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>(DEFAULT_DISCOUNT_CODES);
  const [discountManagerOpen, setDiscountManagerOpen] = useState(false);
  const piecesWithMetrics = promoPieces.filter((p) => p.metrics);
  const totalImpressions = piecesWithMetrics.reduce((sum, p) => sum + (p.metrics?.impressions ?? 0), 0);
  const totalConversions = piecesWithMetrics.reduce((sum, p) => sum + (p.metrics?.conversions ?? 0), 0);
  const totalTipRevenue = piecesWithMetrics.reduce((sum, p) => sum + (p.metrics?.tipRevenue ?? 0), 0);
  const selectedSlot = pickerSlotId ? promoPieces.find((piece) => piece.id === pickerSlotId) : null;
  const activePiece = activePieceId ? promoPieces.find((piece) => piece.id === activePieceId) : null;
  const selectedPiece = selectedPieceId ? promoPieces.find((piece) => piece.id === selectedPieceId) ?? null : null;
  const selectedStrategy = selectedPiece?.strategy ?? DEFAULT_CAMPAIGN_STRATEGY;

  const handleSelectPost = (slotId: number, item: GalleryItem) => {
    setPromoPieces((current) =>
      current.map((piece) =>
        piece.id === slotId
          ? {
              ...piece,
              title: item.title,
              type: inferPromoType(item),
              postId: item.post_id,
              mediaId: item.media_id,
              imageSrc: galleryImageSrc(item),
              metrics: { impressions: 0, conversions: 0, tipRevenue: 0, trend: "flat", trendValue: 0 }
            }
          : piece
      )
    );
    setPickerSlotId(null);
    setSelectedPieceId(slotId);
  };

  const updateSelectedStrategy = (nextStrategy: CampaignStrategy) => {
    if (!selectedPieceId) return;
    setPromoPieces((current) =>
      current.map((piece) => (piece.id === selectedPieceId ? { ...piece, strategy: nextStrategy } : piece))
    );
  };

  const addDiscoverySlot = () => {
    let createdId: number | null = null;
    setPromoPieces((current) => {
      const nextRank = current.length + 1;
      const nextId = Math.max(0, ...current.map((piece) => piece.id)) + 1;
      createdId = nextId;
      return [...current, { id: nextId, rank: nextRank, title: "", type: "photo" }];
    });
    if (createdId !== null) {
      setSelectedPieceId(createdId);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">Campaign</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--lib-fg-muted)]">
            Choose 5 posts you want inserted into the Feeds of likely patrons.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 lg:w-[34rem]">
          <button
            type="button"
            onClick={() => setOpenDiscoveryDrawer("impressions")}
            title="Unique impressions tells you the number of times your art was shown to someone not already in your Patreon following."
            className="min-w-0 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-left transition-colors hover:border-[var(--lib-primary)]/50"
          >
            <span className="flex items-center gap-1.5">
              <Eye size={14} aria-hidden className="shrink-0 text-[var(--lib-primary)]" />
              <span className="truncate text-[10px] text-[var(--lib-fg-muted)]">unique impressions</span>
            </span>
            <span className="mt-1 block truncate text-base font-semibold tabular-nums text-[var(--lib-fg)]">
              {totalImpressions.toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpenDiscoveryDrawer("conversions")}
            title="Conversions is the number of new subscribers from promo links."
            className="min-w-0 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-left transition-colors hover:border-[var(--lib-primary)]/50"
          >
            <span className="flex items-center gap-1.5">
              <Users size={14} aria-hidden className="shrink-0 text-[var(--lib-primary)]" />
              <span className="truncate text-[10px] text-[var(--lib-fg-muted)]">conversions</span>
            </span>
            <span className="mt-1 block truncate text-base font-semibold tabular-nums text-[var(--lib-fg)]">
              {totalConversions}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpenDiscoveryDrawer("conversions")}
            title="Tip revenue is income from people tipping to gain access to a single post."
            className="min-w-0 rounded-xl border border-[color-mix(in_srgb,oklch(0.76_0.09_82)_34%,var(--lib-border))] bg-[var(--lib-card)] px-3 py-2 text-left transition-colors hover:border-[oklch(0.76_0.09_82)]/55"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-[oklch(0.76_0.09_82)]">$</span>
              <span className="truncate text-[10px] text-[var(--lib-fg-muted)]">tip revenue</span>
            </span>
            <span className="mt-1 block truncate text-base font-semibold tabular-nums text-[var(--lib-fg)]">
              {totalTipRevenue.toLocaleString()}
            </span>
          </button>
        </div>
      </div>

      {/* EXPERIMENTAL UI: frosted campaign slot pane.
          Rollback note: this whole wrapper can be replaced with the original standalone
          promo-piece grid followed by <CampaignStrategyPanel />. The negative margin is
          intentional: the Growth Strategy card sits above this pane, making the slots look
          like they emerge from behind the campaign window. Functionality is unchanged. */}
      <div className="relative">
        <div className="relative z-0 mx-2 -mb-7 overflow-hidden rounded-[2rem] border border-b-transparent border-[color-mix(in_srgb,var(--lib-primary)_22%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-card)_46%,transparent)] p-3 pb-8 shadow-[inset_0_1px_0_color-mix(in_srgb,white_5%,transparent),0_24px_80px_-60px_color-mix(in_srgb,var(--lib-primary)_40%,black)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-20 rounded-b-[2rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--lib-primary)_24%,transparent),transparent_68%)]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--lib-primary)_8%,transparent)] via-transparent to-[color-mix(in_srgb,var(--lib-card)_34%,transparent)]" />
          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {promoPieces.map((piece) => (
              <div
                key={piece.id}
                className={[
                  "rounded-[1.5rem] border p-1.5 transition-transform",
                  selectedPieceId === piece.id
                    ? "border-[color-mix(in_srgb,oklch(0.76_0.09_82)_48%,var(--lib-border))] bg-[color-mix(in_srgb,oklch(0.22_0.04_82)_34%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,oklch(0.76_0.09_82)_16%,transparent),0_18px_36px_-28px_oklch(0.76_0.09_82)]"
                    : "border-[color-mix(in_srgb,var(--lib-border)_62%,transparent)] bg-[color-mix(in_srgb,var(--lib-bg)_30%,transparent)]"
                ].join(" ")}
              >
                <PromoCard
                  piece={piece}
                  onAdd={setPickerSlotId}
                  onInspect={(slotId) => {
                    setOpenPieceMenuId(null);
                    setActivePieceId(slotId);
                  }}
                  onSelect={(slotId) => {
                    setSelectedPieceId(slotId);
                    setOpenPieceMenuId(null);
                  }}
                  onChangeMedia={(slotId) => {
                    setOpenPieceMenuId(null);
                    setPickerSlotId(slotId);
                  }}
                  isMenuOpen={openPieceMenuId === piece.id}
                  onToggleMenu={(slotId) => setOpenPieceMenuId((current) => (current === slotId ? null : slotId))}
                />
              </div>
            ))}
          </div>
          <div className="relative mt-3 flex justify-end">
            <button
              type="button"
              onClick={addDiscoverySlot}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-bg))] px-2.5 py-1.5 text-[9px] font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/60"
            >
              <Plus size={10} aria-hidden />
              More
            </button>
          </div>
        </div>

        <div className="relative z-10">
          <CampaignStrategyPanel
            selectedPiece={selectedPiece}
            strategy={selectedStrategy}
            onStrategyChange={updateSelectedStrategy}
            discountCodes={discountCodes}
            onManageDiscounts={() => setDiscountManagerOpen(true)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--lib-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-[var(--lib-fg-muted)]">
          Today this links to Discover eligibility. Real unique impressions and conversions need backend event tracking.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-sm text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50"
          >
            <Settings size={16} aria-hidden />
            Manage eligibility
          </Link>
          <Link
            href="/patron/discover"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-sm text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/50"
          >
            <ExternalLink size={16} aria-hidden />
            Preview
          </Link>
        </div>
      </div>

      {openDiscoveryDrawer === "impressions" ? (
        <Drawer title="Unique impressions" onClose={() => setOpenDiscoveryDrawer(null)}>
          <div className="space-y-5 p-5">
            <p className="text-sm leading-6 text-[var(--lib-fg-muted)]">
              Planned breakdown for how often each Discovery piece is uniquely inserted into likely-patron feeds.
            </p>
            <div className="grid gap-3">
              {piecesWithMetrics.map((piece) => (
                <div
                  key={piece.id}
                  className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--lib-fg)]">{piece.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">
                        Discovery slot {piece.rank}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-[var(--lib-fg)]">
                      {piece.metrics!.impressions.toLocaleString()}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[var(--lib-fg-muted)]">
                    <span>Feed insertions: {Math.round(piece.metrics!.impressions * 1.34).toLocaleString()}</span>
                    <span>Unique viewers: {piece.metrics!.impressions.toLocaleString()}</span>
                    <span>Repeat exposure: {(piece.metrics!.impressions * 0.18).toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      ) : null}

      {openDiscoveryDrawer === "conversions" ? (
        <Drawer title="Conversions" onClose={() => setOpenDiscoveryDrawer(null)}>
          <div className="space-y-5 p-5">
            <p className="text-sm leading-6 text-[var(--lib-fg-muted)]">
              Planned attribution detail for new subscribers, pledged tiers, and estimated value from Discovery pieces.
            </p>
            <div className="grid gap-3">
              <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">New unique subscribers</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">34</p>
              </div>
              <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Tier pledge mix</p>
                <div className="mt-3 space-y-2 text-sm text-[var(--lib-fg-muted)]">
                  <div className="flex justify-between gap-3">
                    <span>Supporter tier</span>
                    <span className="text-[var(--lib-fg)]">18 subscribers</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Archive tier</span>
                    <span className="text-[var(--lib-fg)]">11 subscribers</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Studio tier</span>
                    <span className="text-[var(--lib-fg)]">5 subscribers</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Estimated monthly value</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">$286</p>
                <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
                  Mock estimate until Discovery conversion tracking is wired.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--lib-fg-muted)]">Post attribution</p>
                    <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
                      Which Discovery pieces are most responsible for new subscribers and value.
                    </p>
                  </div>
                  <span className="rounded-full border border-[color-mix(in_srgb,oklch(0.67_0.09_82)_45%,var(--lib-border))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[oklch(0.76_0.09_82)]">
                    Mock
                  </span>
                </div>
                <div className="mt-4 divide-y divide-[var(--lib-border)]">
                  {CONVERSION_POST_ATTRIBUTION.map((post) => (
                    <div key={post.title} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--lib-fg)]">{post.title}</p>
                        <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
                          Leading pledge: {post.leadingTier} · {post.share} of conversions
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm sm:justify-end">
                        <span className="tabular-nums text-[var(--lib-fg)]">{post.subscribers} subs</span>
                        <span className="tabular-nums text-[oklch(0.76_0.09_82)]">{post.estimatedValue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Drawer>
      ) : null}

      {pickerSlotId !== null && selectedSlot ? (
        <DiscoveryPostPickerModal
          creatorId={creatorId}
          slotId={selectedSlot.rank}
          onClose={() => setPickerSlotId(null)}
          onSelect={(_slotRank, item) => handleSelectPost(selectedSlot.id, item)}
        />
      ) : null}

      {activePiece ? (
        <DiscoveryPieceDetailModal
          piece={activePiece}
          onBack={() => setActivePieceId(null)}
          onChangeMedia={() => {
            setActivePieceId(null);
            setPickerSlotId(activePiece.id);
          }}
        />
      ) : null}

      {discountManagerOpen ? (
        <DiscountCodesModal
          codes={discountCodes}
          onChange={setDiscountCodes}
          onClose={() => setDiscountManagerOpen(false)}
        />
      ) : null}
    </section>
  );
}

function CommunitySection({
  openDrawer,
  setOpenDrawer
}: {
  openDrawer: DrawerKind;
  setOpenDrawer: (drawer: DrawerKind) => void;
}) {
  const unread = COMMUNITY_FEED.filter((item) => !item.read).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">Community</h2>
            <MockBadge />
          </div>
          <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
            Creator-facing comments, replies, views, and reports. Reports can route to the live moderation queue today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenDrawer("inbox")}
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_50%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_20%,var(--lib-bg))] px-4 py-2 text-sm font-medium text-[oklch(0.82_0.075_155)]"
          >
            <MessageSquare size={16} aria-hidden />
            Inbox
            {unread > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--lib-primary)_22%,black)] px-1 text-xs">{unread}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setOpenDrawer("moderation")}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-2 text-sm text-[var(--lib-fg)] hover:border-[oklch(0.55_0.16_35)]/60"
          >
            <Flag size={16} aria-hidden className="text-[oklch(0.72_0.15_35)]" />
            Moderation
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Comments" value={24} delta={6} Icon={MessageSquare} onClick={() => setOpenDrawer("inbox")} />
        <StatCard label="Replies" value={11} delta={3} Icon={CornerDownRight} onClick={() => setOpenDrawer("inbox")} />
        <StatCard label="Views" value={8412} delta={184} Icon={Eye} />
        <StatCard label="Reports" value={2} Icon={Flag} urgent onClick={() => setOpenDrawer("moderation")} />
      </div>

      {openDrawer === "inbox" ? (
        <Drawer title="Inbox" onClose={() => setOpenDrawer(null)}>
          <div className="divide-y divide-[var(--lib-border)]">
            {COMMUNITY_FEED.map((item) => (
              <div
                key={item.id}
                className={[
                  "flex items-start gap-3 px-5 py-4 transition-colors hover:bg-[var(--lib-card)]",
                  !item.read ? "bg-[color-mix(in_srgb,var(--lib-primary)_8%,transparent)]" : ""
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    item.type === "report"
                      ? "bg-[color-mix(in_srgb,oklch(0.55_0.16_35)_20%,var(--lib-card))]"
                      : "bg-[var(--lib-card)]"
                  ].join(" ")}
                >
                  {item.type === "comment" ? <MessageSquare size={16} aria-hidden className="text-[var(--lib-fg-muted)]" /> : null}
                  {item.type === "reply" ? <CornerDownRight size={16} aria-hidden className="text-[var(--lib-fg-muted)]" /> : null}
                  {item.type === "report" ? <Flag size={16} aria-hidden className="text-[oklch(0.72_0.15_35)]" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--lib-fg)]">@{item.user}</span>
                    <span className="text-xs text-[var(--lib-fg-muted)]">{item.time}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-[var(--lib-fg-muted)]">{item.content}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-[var(--lib-fg-muted)]">
                    <ChevronRight size={12} aria-hidden />
                    {item.target}
                  </p>
                </div>
                {!item.read ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[oklch(0.76_0.09_82)]" /> : null}
              </div>
            ))}
          </div>
        </Drawer>
      ) : null}

      {openDrawer === "moderation" ? (
        <Drawer title="Moderation" onClose={() => setOpenDrawer(null)}>
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-[oklch(0.52_0.16_35)]/40 bg-[color-mix(in_srgb,oklch(0.22_0.08_35)_38%,var(--lib-card))] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,oklch(0.55_0.16_35)_20%,var(--lib-card))]">
                  <Flag size={16} aria-hidden className="text-[oklch(0.72_0.15_35)]" />
                </div>
                <div>
                  <p className="text-sm text-[var(--lib-fg)]">Reported comment on &quot;Autumn Series No. 4&quot;</p>
                  <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">Mock preview. Use the live queue to resolve real reports.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-sm text-[var(--lib-fg-muted)]"
                  onClick={() => setOpenDrawer(null)}
                >
                  Dismiss
                </button>
                <Link
                  href="/studio/moderation/reports"
                  className="flex-1 rounded-lg bg-[oklch(0.42_0.14_35)] px-3 py-2 text-center text-sm font-medium text-white hover:bg-[oklch(0.48_0.14_35)]"
                >
                  Review live queue
                </Link>
              </div>
            </div>
          </div>
        </Drawer>
      ) : null}
    </section>
  );
}

function GallerySection() {
  const [sortMode, setSortMode] = useState<"recent" | "comments">("recent");
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<number[]>([]);
  const stats = [
    { label: "Posts", value: 48, Icon: BookMarked },
    { label: "Collections", value: 4, Icon: Layers },
    { label: "Published", value: 41, Icon: Globe },
    { label: "Drafts", value: 7, Icon: PenLine }
  ];
  const posts = [...MANAGED_GALLERY_POSTS].sort((a, b) =>
    sortMode === "comments"
      ? a.latestCommentRecencyMinutes - b.latestCommentRecencyMinutes
      : a.publishedAgeMinutes - b.publishedAgeMinutes
  );
  const selectedPost = selectedPostId ? MANAGED_GALLERY_POSTS.find((post) => post.id === selectedPostId) ?? null : null;

  const toggleCommentHidden = (commentId: number) => {
    setHiddenCommentIds((current) =>
      current.includes(commentId) ? current.filter((id) => id !== commentId) : [...current, commentId]
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">Manage Gallery</h2>
        <MockBadge />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-center gap-4 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--lib-primary)_15%,var(--lib-card))]">
              <Icon size={20} aria-hidden className="text-[var(--lib-primary)]" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-[var(--lib-fg)]">{value}</p>
              <p className="text-xs text-[var(--lib-fg-muted)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_72%,var(--lib-bg))] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-base text-[var(--lib-fg)]">Manage Posts</h3>
              <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
                Review library posts, engagement, and comment activity from one vertical tray.
              </p>
            </div>
            <div className="flex rounded-full border border-[var(--lib-border)] bg-[var(--lib-bg)] p-1">
              <button
                type="button"
                onClick={() => setSortMode("recent")}
                className={[
                  "rounded-full px-3 py-1.5 text-xs transition-colors",
                  sortMode === "recent"
                    ? "bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-card))] text-[var(--lib-fg)]"
                    : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                ].join(" ")}
              >
                Recency
              </button>
              <button
                type="button"
                onClick={() => setSortMode("comments")}
                className={[
                  "rounded-full px-3 py-1.5 text-xs transition-colors",
                  sortMode === "comments"
                    ? "bg-[color-mix(in_srgb,var(--lib-primary)_18%,var(--lib-card))] text-[var(--lib-fg)]"
                    : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                ].join(" ")}
              >
                Latest comment
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--lib-border)]">
            {posts.map((post) => (
              <article
                key={post.id}
                className="flex flex-col gap-3 border-b border-[var(--lib-border)] bg-[var(--lib-card)] p-3 last:border-b-0 min-[600px]:flex-row min-[600px]:items-stretch min-[600px]:gap-4"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-[var(--lib-fg)]">{post.title}</h4>
                        <p className="mt-1 line-clamp-1 text-xs text-[var(--lib-fg-muted)]">{post.excerpt}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-[var(--lib-fg-muted)]">{post.publishedAt}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--lib-fg-muted)]">
                      Latest comment {post.latestCommentAt} · {post.comments.length} thread{post.comments.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedPostId(post.id)}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lib-primary)_36%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-bg))] px-3 py-1.5 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/70"
                    >
                      <MessageSquare size={13} aria-hidden />
                      Manage Comments
                    </button>
                  </div>
                  <div className={["h-20 w-24 shrink-0 rounded-xl bg-gradient-to-br", post.thumbnailTone].join(" ")}>
                    <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/20 text-[var(--lib-fg-muted)]">
                      <Images size={20} aria-hidden />
                    </div>
                  </div>
                </div>

                <div className="grid w-full min-w-0 shrink-0 auto-rows-[3.5rem] grid-cols-3 items-stretch gap-1.5 min-[600px]:w-44 min-[600px]:self-stretch min-[700px]:w-48">
                  <StatMini label="Views" value={post.metrics.views} />
                  <StatMini label="Favs" value={post.metrics.favorites} />
                  <StatMini label="Saved" value={post.metrics.collections} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="rounded-2xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_72%,var(--lib-bg))] p-4">
          <p className="mb-3 text-sm text-[var(--lib-fg-muted)]">
            Public URL and profile settings remain live inside this management area.
          </p>
          <CreatorPublicUrlSettings />
        </div>
      </div>

      {selectedPost ? (
        <PostCommentsModal
          post={selectedPost}
          hiddenCommentIds={hiddenCommentIds}
          onToggleHidden={toggleCommentHidden}
          onClose={() => setSelectedPostId(null)}
        />
      ) : null}
    </section>
  );
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="box-border flex h-full min-h-0 min-w-0 flex-col items-center justify-center rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-1 py-1.5 text-center">
      <p className="w-full min-w-0 text-center text-[9px] font-semibold tabular-nums leading-none text-[var(--lib-fg)] [overflow-wrap:normal] min-[700px]:text-[11px]">
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 w-full shrink-0 text-[7px] font-semibold uppercase leading-tight tracking-wide text-[var(--lib-fg-muted)]">
        {label}
      </p>
    </div>
  );
}

function PostCommentsModal({
  post,
  hiddenCommentIds,
  onToggleHidden,
  onClose
}: {
  post: ManagedGalleryPost;
  hiddenCommentIds: number[];
  onToggleHidden: (commentId: number) => void;
  onClose: () => void;
}) {
  const visibleComments = post.comments.filter((comment) => !hiddenCommentIds.includes(comment.id));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close post comment manager"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[81] flex max-h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-bg)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--lib-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
              Manage Comments
            </p>
            <h3 className="mt-1 truncate font-[family-name:var(--font-display)] text-xl text-[var(--lib-fg)]">
              {post.title}
            </h3>
            <p className="mt-1 text-sm text-[var(--lib-fg-muted)]">
              Review recent comments and the coordinate-coded pinboard as patrons see it in feed.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/patron/feed"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/60"
            >
              Live feed view
              <ExternalLink size={13} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-h-0 overflow-y-auto p-5">
            <div className="rounded-2xl border border-[var(--lib-border)] bg-black/35 p-4">
              <div className="relative mx-auto aspect-[4/3] max-h-[520px] overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)]">
                <div className={["absolute inset-[8%_26%] rounded-sm bg-gradient-to-br", post.thumbnailTone].join(" ")}>
                  <div className="flex h-full w-full items-center justify-center bg-black/10 text-[var(--lib-fg-muted)]">
                    <Images size={40} aria-hidden />
                  </div>
                </div>
                {visibleComments.map((comment, index) => (
                  <div
                    key={comment.id}
                    className="absolute z-10"
                    style={{ left: `${comment.x}%`, top: `${comment.y}%` }}
                  >
                    <div className="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--lib-primary)] text-xs font-semibold text-black shadow-lg">
                      {index + 1}
                    </div>
                    <div className="mt-2 w-56 -translate-x-1/2 rounded-xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_92%,black)] p-3 shadow-xl">
                      <p className="text-xs font-semibold text-[var(--lib-fg)]">{comment.user}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--lib-fg-muted)]">{comment.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--lib-fg-muted)]">
                Mock pinboard preview. Future live data will use stored comment coordinates from the feed view.
              </p>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-t border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_56%,var(--lib-bg))] p-4 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[var(--lib-fg)]">Recent comments</h4>
              <span className="text-xs text-[var(--lib-fg-muted)]">{post.comments.length} total</span>
            </div>
            <div className="space-y-3">
              {post.comments.map((comment) => {
                const hidden = hiddenCommentIds.includes(comment.id);
                return (
                  <div
                    key={comment.id}
                    className={[
                      "rounded-xl border p-3",
                      hidden
                        ? "border-[oklch(0.52_0.14_35)]/40 bg-[color-mix(in_srgb,oklch(0.22_0.08_35)_35%,var(--lib-bg))] opacity-75"
                        : "border-[var(--lib-border)] bg-[var(--lib-bg)]"
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--lib-fg)]">{comment.user}</p>
                        <p className="text-xs text-[var(--lib-fg-muted)]">{comment.time} ago</p>
                      </div>
                      {hidden ? (
                        <span className="rounded-full border border-[oklch(0.52_0.14_35)]/50 px-2 py-0.5 text-[10px] text-[oklch(0.74_0.12_55)]">
                          Hidden
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-[var(--lib-fg-muted)]">{comment.body}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleHidden(comment.id)}
                        className="flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/60"
                      >
                        {hidden ? "Restore" : "Hide comment"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[oklch(0.52_0.14_35)]/45 px-3 py-2 text-xs text-[oklch(0.74_0.12_55)]"
                      >
                        Turn off thread
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InsightsSection({
  cards,
  health,
  busyId,
  onAccept,
  onDismiss
}: {
  cards: ActionCenterCard[];
  health: AnalyticsHealthData | null;
  busyId: string | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
            Legacy analytics
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--lib-fg)]">Insights</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--lib-fg-muted)]">
            Prioritized recommendations from the existing Action Center analytics pipeline.
          </p>
        </div>
        {health ? (
          <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-[11px] text-[var(--lib-fg-muted)]">
            <span
              className={
                health.status === "ok" ? "text-[oklch(0.72_0.12_145)]" : "text-[oklch(0.72_0.14_55)]"
              }
            >
              API insight jobs: {health.status}
            </span>
            {health.metrics.generate_attempts > 0 && (
              <span className="ml-2">
                success{" "}
                {health.metrics.success_ratio !== null
                  ? `${(health.metrics.success_ratio * 100).toFixed(1)}%`
                  : "--"}{" "}
                ({health.metrics.generate_successes}/
                {health.metrics.generate_successes + health.metrics.generate_failures} completed)
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {cards.length === 0 ? (
          <p className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-4 text-sm text-[var(--lib-fg-muted)]">
            No open cards. Run <strong>Refresh insights</strong> after ingesting posts, or sign in on{" "}
            <code className="rounded bg-[var(--lib-card)] px-1">/login</code> to use your studio{" "}
            <code className="rounded bg-[var(--lib-card)] px-1">relay_creator_id</code> (legacy dev fallback:{" "}
            <code className="rounded bg-[var(--lib-card)] px-1">NEXT_PUBLIC_RELAY_CREATOR_ID</code>).
          </p>
        ) : (
          cards.map((card) => (
            <article
              key={card.recommendation_id}
              className="rounded-lg border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_88%,var(--lib-bg))] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    {card.card_type.replace(/_/g, " ")}
                  </p>
                  <h3 className="mt-1 font-[family-name:var(--font-display)] text-base">{card.title}</h3>
                </div>
                <span className="rounded-full border border-[var(--lib-border)] px-2 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                  {(card.confidence_score * 100).toFixed(0)}% confidence
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Signal</dt>
                  <dd className="text-[var(--lib-fg)]">{card.signal}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Diagnosis</dt>
                  <dd>{card.diagnosis}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Recommendation</dt>
                  <dd>{card.recommendation}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--lib-fg-muted)]">Expected impact</dt>
                  <dd>
                    {formatDeltaRange(
                      card.expected_impact.metric,
                      card.expected_impact.delta_range,
                      card.expected_impact.horizon_days
                    )}
                  </dd>
                </div>
              </dl>
              {card.status === "open" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === card.recommendation_id}
                    onClick={() => onAccept(card.recommendation_id)}
                    className="rounded-md bg-[oklch(0.42_0.14_145)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[oklch(0.48_0.14_145)] disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === card.recommendation_id}
                    onClick={() => onDismiss(card.recommendation_id)}
                    className="rounded-md border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:bg-[var(--lib-card)] disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {card.status !== "open" && (
                <p className="mt-3 text-xs text-[var(--lib-fg-muted)]">Status: {card.status}</p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function ActionCenterView() {
  const { creatorId } = useStudioSession();
  const [activeSection, setActiveSection] = useState<ActiveSection>("discovery");
  const [openDrawer, setOpenDrawer] = useState<DrawerKind>(null);
  const [cards, setCards] = useState<ActionCenterCard[]>([]);
  const [health, setHealth] = useState<AnalyticsHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, h] = await Promise.all([
        fetchActionCenterCards(creatorId),
        fetchAnalyticsHealth()
      ]);
      setCards(list.items);
      setHealth(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefreshInsights = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await postAnalyticsGenerate(creatorId);
      await load();
      setActiveSection("insights");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await postActionCenterAccept(creatorId, id, "accepted from Action Center");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await postActionCenterDismiss(creatorId, id, "not_relevant_now");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
        Loading Action Center...
      </div>
    );
  }

  return (
    <div
      className="library-shell flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--lib-bg)] text-[var(--lib-fg)]"
      style={ACTION_CENTER_THEME}
    >
      <header className="shrink-0 border-b border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_65%,var(--lib-bg))] px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[oklch(0.76_0.09_82)]">
              Creator workspace
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--lib-fg)]">
              Action Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)]">
              Manage your discovery, community, posts, all in one place. Creator:{" "}
              <code className="rounded bg-[var(--lib-card)] px-1 py-0.5 text-[11px]">{creatorId}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefreshInsights()}
            disabled={refreshing}
            className="shrink-0 rounded-md border border-[var(--lib-border)] bg-[oklch(0.22_0.012_160)] px-4 py-2 text-xs font-medium text-[var(--lib-fg)] transition hover:bg-[oklch(0.26_0.012_160)] disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh insights"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-auto w-full max-w-6xl px-6 py-3 text-sm text-[oklch(0.72_0.14_55)]">
          {error}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
        <SectionTabs activeSection={activeSection} onChange={setActiveSection} />

        <div className="rounded-2xl border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-card)_78%,var(--lib-bg))] p-4 shadow-sm">
          {activeSection === "discovery" ? <DiscoverySection creatorId={creatorId} /> : null}
          {activeSection === "community" ? (
            <CommunitySection openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} />
          ) : null}
          {activeSection === "gallery" ? <GallerySection /> : null}
          {activeSection === "insights" ? (
            <InsightsSection
              cards={cards}
              health={health}
              busyId={busyId}
              onAccept={(id) => void onAccept(id)}
              onDismiss={(id) => void onDismiss(id)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
