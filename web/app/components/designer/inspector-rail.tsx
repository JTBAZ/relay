"use client";

import { useState, useEffect } from "react";
import {
  Palette,
  LayoutTemplate,
  Layers,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Lock,
  CornerDownRight,
  ShoppingBag,
  Megaphone,
  Users,
  X,
  Link2,
  Mail,
  Trophy,
  Brush,
  Bell,
} from "lucide-react";
import type {
  PageLayout,
  ThemeConfig,
  HeroConfig,
  ThemeRadius,
  SectionLayout,
  Collection,
  AnySection,
  LibrarySection,
  ShopSection,
  EngagementSection,
  AnnouncementBanner,
  TypographyStyle,
  EngagementBlockType,
  GalleryArrangement,
  PatreonLinkPosition,
} from "@/lib/designer-mock";
import { TIERS, LIBRARY_ALL_VISIBLE_SLUG } from "@/lib/designer-mock";

// ─── Panel wrapper ─────────────────────────────────────────────────────────────

function PanelSection({
  id,
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--relay-border)" }}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`panel-${id}`}
      >
        <span className="flex items-center gap-2">
          <span style={{ color: "var(--relay-green-400)" }}>{icon}</span>
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--relay-fg-muted)", letterSpacing: "0.1em" }}
          >
            {label}
          </span>
        </span>
        {open ? (
          <ChevronUp size={13} style={{ color: "var(--relay-fg-subtle)" }} />
        ) : (
          <ChevronDown size={13} style={{ color: "var(--relay-fg-subtle)" }} />
        )}
      </button>
      {open && (
        <div id={`panel-${id}`} className="px-4 pb-4 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field atoms ───────────────────────────────────────────────────────────────

function FieldRow({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs" style={{ color: "var(--relay-fg-subtle)" }}>
        {label}
      </span>
      {sublabel ? (
        <span
          className="text-[10px] leading-snug -mt-0.5"
          style={{ color: "var(--relay-fg-subtle)", opacity: 0.9 }}
        >
          {sublabel}
        </span>
      ) : null}
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <span className="text-xs" style={{ color: "var(--relay-fg)" }}>
          {label}
        </span>
        {sublabel && (
          <span
            className="text-xs"
            style={{ color: "var(--relay-fg-subtle)" }}
          >
            {sublabel}
          </span>
        )}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          background: value
            ? "var(--relay-green-600)"
            : "var(--relay-border-hi)",
          minWidth: "2rem",
          width: "2rem",
          height: "1.125rem",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-transform"
          style={{
            width: "0.875rem",
            height: "0.875rem",
            background: "var(--relay-fg)",
            left: value ? "calc(100% - 0.875rem - 2px)" : "2px",
          }}
        />
      </button>
    </div>
  );
}

function PillSelect<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className="text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{
            background:
              value === opt.value
                ? "var(--relay-green-800)"
                : "var(--relay-surface-2)",
            color:
              value === opt.value
                ? "var(--relay-green-400)"
                : "var(--relay-fg-muted)",
            border: `1px solid ${
              value === opt.value
                ? "var(--relay-green-600)"
                : "var(--relay-border)"
            }`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs px-2.5 py-1.5 rounded-md"
      style={{
        background: "var(--relay-surface-2)",
        border: "1px solid var(--relay-border)",
        color: "var(--relay-fg)",
        outline: "none",
      }}
      onFocus={(e) => (e.target.style.borderColor = "var(--relay-green-600)")}
      onBlur={(e) => (e.target.style.borderColor = "var(--relay-border)")}
    />
  );
}

function BioTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={4}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-[88px] resize-y text-xs px-2.5 py-1.5 rounded-md leading-relaxed"
      style={{
        background: "var(--relay-surface-2)",
        border: "1px solid var(--relay-border)",
        color: "var(--relay-fg)",
        outline: "none",
      }}
      onFocus={(e) => (e.target.style.borderColor = "var(--relay-green-600)")}
      onBlur={(e) => (e.target.style.borderColor = "var(--relay-border)")}
    />
  );
}

// ─── Theme panel ──────────────────────────────────────────────────────────────

function ThemePanel({
  theme,
  bio,
  onChange,
  onBioChange,
}: {
  theme: ThemeConfig;
  /** Persisted on the layout as `hero.bio` — shown under the headline when Show bio is on */
  bio: string;
  onChange: (t: ThemeConfig) => void;
  onBioChange: (v: string) => void;
}) {
  useEffect(() => {
    if (theme.lockedArtStyle !== "paywall") return;
    onChange({ ...theme, lockedArtStyle: "blurred" });
  }, [theme.lockedArtStyle]);

  return (
    <>
      <FieldRow label="Typography">
        <PillSelect<TypographyStyle>
          options={[
            { value: "editorial", label: "Editorial" },
            { value: "minimal",   label: "Minimal"   },
            { value: "warm",      label: "Warm"       },
            { value: "mono",      label: "Mono"       },
          ]}
          value={theme.typography}
          onChange={(v) => onChange({ ...theme, typography: v })}
        />
      </FieldRow>

      <FieldRow label="Corner radius">
        <PillSelect<ThemeRadius>
          options={[
            { value: "none", label: "Square"  },
            { value: "sm",   label: "Subtle"  },
            { value: "md",   label: "Rounded" },
            { value: "lg",   label: "Soft"    },
          ]}
          value={theme.radius}
          onChange={(v) => onChange({ ...theme, radius: v })}
        />
      </FieldRow>

      <FieldRow label="Locked content style">
        <PillSelect<"blurred" | "locked">
          options={[
            { value: "blurred", label: "Blurred" },
            { value: "locked", label: "Locked" },
          ]}
          value={theme.lockedArtStyle === "paywall" ? "blurred" : theme.lockedArtStyle}
          onChange={(v) => onChange({ ...theme, lockedArtStyle: v })}
        />
      </FieldRow>

      <FieldRow
        label="Gallery arrangement"
        sublabel="Order of items in each Library section (saved with your layout)"
      >
        <PillSelect<GalleryArrangement>
          options={[
            { value: "chronological", label: "Newest first" },
            { value: "tier", label: "By tier" },
          ]}
          value={theme.galleryArrangement}
          onChange={(v) => onChange({ ...theme, galleryArrangement: v })}
        />
      </FieldRow>

      <ToggleRow
        label="Show bio"
        sublabel="Appears beneath hero, uses body typography"
        value={theme.showBio}
        onChange={(v) => onChange({ ...theme, showBio: v })}
      />
      {theme.showBio ? (
        <FieldRow label="Bio" sublabel="Saved to your site layout (not Patreon)">
          <BioTextarea
            value={bio}
            onChange={onBioChange}
            placeholder="A few lines about you or your work…"
          />
        </FieldRow>
      ) : null}
      <ToggleRow
        label="Show Patreon link"
        sublabel="Uses patreon.com slug from your Library when synced"
        value={theme.showPatreonLink}
        onChange={(v) => onChange({ ...theme, showPatreonLink: v })}
      />
      {theme.showPatreonLink ? (
        <FieldRow
          label="Patreon link placement"
          sublabel="Where the link appears on your public profile hero"
        >
          <PillSelect<PatreonLinkPosition>
            options={[
              { value: "below_avatar", label: "Below profile photo" },
              { value: "below_bio", label: "Below bio" },
            ]}
            value={theme.patreonLinkPosition ?? "below_bio"}
            onChange={(v) => onChange({ ...theme, patreonLinkPosition: v })}
          />
        </FieldRow>
      ) : null}
      <ToggleRow
        label="Tier badges"
        sublabel="Membership row on profile hero and chips on layout tiles"
        value={theme.showTierBadges}
        onChange={(v) => onChange({ ...theme, showTierBadges: v })}
      />
    </>
  );
}

// ─── Hero panel ───────────────────────────────────────────────────────────────

function HeroPanel({
  hero,
  onChange,
}: {
  hero: HeroConfig;
  onChange: (h: HeroConfig) => void;
}) {
  return (
    <>
      <FieldRow label="Headline">
        <InlineInput
          value={hero.headline}
          onChange={(v) => onChange({ ...hero, headline: v })}
        />
      </FieldRow>

      <FieldRow label="Subline">
        <InlineInput
          value={hero.subline}
          onChange={(v) => onChange({ ...hero, subline: v })}
        />
      </FieldRow>

      <ToggleRow
        label="Show avatar"
        value={hero.showAvatar}
        onChange={(v) => onChange({ ...hero, showAvatar: v })}
      />
      <ToggleRow
        label="Cover image"
        sublabel="Full-width background behind hero"
        value={hero.showCover}
        onChange={(v) => onChange({ ...hero, showCover: v })}
      />

      {hero.showCover && (
        <div
          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs"
          style={{
            background: "var(--relay-surface-2)",
            border: "1px solid var(--relay-border)",
            color: "var(--relay-fg-muted)",
          }}
        >
          <span className="truncate">cover.jpg</span>
          <button
            className="flex items-center gap-1 shrink-0 text-xs transition-colors"
            style={{ color: "var(--relay-green-400)" }}
          >
            <Pencil size={10} />
            Change
          </button>
        </div>
      )}
    </>
  );
}

// ─── Section type helpers ─────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  public:    "var(--relay-fg-subtle)",
  supporter: "var(--relay-green-400)",
  member:    "#60a5fa",
  inner:     "var(--relay-gold-500)",
};

const LAYOUT_OPTIONS: { value: SectionLayout; label: string }[] = [
  { value: "grid",     label: "Grid"     },
  { value: "masonry",  label: "Masonry"  },
  { value: "list",     label: "List"     },
  { value: "featured", label: "Featured" },
];

const ENGAGEMENT_ICONS: Record<EngagementBlockType, React.ReactNode> = {
  newsletter: <Mail size={11} />,
  commission: <Brush size={11} />,
  contest:    <Trophy size={11} />,
  links:      <Link2 size={11} />,
};

function SectionKindChip({ kind }: { kind: AnySection["kind"] }) {
  const meta: Record<AnySection["kind"], { label: string; color: string }> = {
    library:      { label: "Library",      color: "var(--relay-fg-subtle)" },
    shop:         { label: "Shop",         color: "#f59e0b" },
    engagement:   { label: "Engagement",   color: "#60a5fa" },
    announcement: { label: "Announcement", color: "#f87171" },
  };
  const { label, color } = meta[kind];
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded shrink-0"
      style={{
        fontSize: "0.6rem",
        color,
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

// ─── Library section row ───────────────────────────────────────────────────────

function LibrarySectionRow({
  section,
  collection,
  collections,
  onChange,
  onRemove,
}: {
  section: LibrarySection;
  collection: Collection | undefined;
  collections: Collection[];
  onChange: (s: LibrarySection) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: "1px solid var(--relay-border)" }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-2"
        style={{ background: "var(--relay-surface-2)" }}
      >
        <GripVertical
          size={14}
          style={{ color: "var(--relay-fg-subtle)", cursor: "grab" }}
          className="shrink-0"
        />
        <button
          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          onClick={() => setExpanded((p) => !p)}
        >
          <span
            className="text-xs font-medium truncate"
            style={{
              color: section.visible
                ? "var(--relay-fg)"
                : "var(--relay-fg-subtle)",
            }}
          >
            {section.label}
          </span>
          <SectionKindChip kind="library" />
          {section.filterQuery !== undefined ? (
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--relay-green-400)" }}
            >
              All visible work
            </span>
          ) : (
            collection && (
              <span
                className="text-xs shrink-0"
                style={{
                  color:
                    TIER_COLOR[collection.tier] ?? "var(--relay-fg-subtle)",
                }}
              >
                {collection.tier !== "public" && (
                  <Lock size={9} className="inline mr-0.5" />
                )}
                {collection.label}
              </span>
            )
          )}
        </button>
        <button
          onClick={() => onChange({ ...section, visible: !section.visible })}
          className="shrink-0 p-1 rounded transition-colors"
          aria-label={section.visible ? "Hide" : "Show"}
          style={{
            color: section.visible
              ? "var(--relay-green-400)"
              : "var(--relay-fg-subtle)",
          }}
        >
          {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="shrink-0 p-1 rounded"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div
          className="px-3 py-3 flex flex-col gap-3"
          style={{
            background: "var(--relay-bg)",
            borderTop: "1px solid var(--relay-border)",
          }}
        >
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--relay-fg-subtle)" }}
          >
            <CornerDownRight size={11} />
            <span>
              Sourced from&nbsp;
              <span style={{ color: "var(--relay-fg-muted)" }}>
                {section.filterQuery !== undefined
                  ? "All visible work"
                  : collection?.label ?? section.collectionSlug}
              </span>
              {section.filterQuery === undefined && collection && (
                <span> · {collection.itemCount} items</span>
              )}
            </span>
          </div>

          <FieldRow label="Section label">
            <InlineInput
              value={section.label}
              onChange={(v) => onChange({ ...section, label: v })}
            />
          </FieldRow>

          <FieldRow label="Collection">
            <select
              value={
                section.filterQuery !== undefined
                  ? LIBRARY_ALL_VISIBLE_SLUG
                  : section.collectionSlug
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === LIBRARY_ALL_VISIBLE_SLUG) {
                  onChange({
                    ...section,
                    filterQuery: {},
                    collectionSlug:
                      collections[0]?.slug ?? section.collectionSlug,
                  });
                } else {
                  onChange({
                    ...section,
                    filterQuery: undefined,
                    collectionSlug: v,
                  });
                }
              }}
              className="w-full text-xs px-2.5 py-1.5 rounded-md"
              style={{
                background: "var(--relay-surface-2)",
                border: "1px solid var(--relay-border)",
                color: "var(--relay-fg)",
                outline: "none",
              }}
            >
              <option value={LIBRARY_ALL_VISIBLE_SLUG}>
                All visible work (full catalog)
              </option>
              {collections.length === 0 ? (
                <option value="" disabled>
                  No collections
                </option>
              ) : (
                collections.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          </FieldRow>

          <FieldRow label="Layout">
            <PillSelect<SectionLayout>
              options={LAYOUT_OPTIONS}
              value={section.layout}
              onChange={(v) => onChange({ ...section, layout: v })}
            />
          </FieldRow>

          <FieldRow label={`Item limit — ${section.itemLimit}`}>
            <input
              type="range"
              min={4}
              max={36}
              step={4}
              value={section.itemLimit}
              onChange={(e) =>
                onChange({ ...section, itemLimit: Number(e.target.value) })
              }
              className="w-full h-1"
              style={{ accentColor: "var(--relay-green-400)" }}
            />
          </FieldRow>

          <FieldRow label="Grid size (columns)">
            <PillSelect<2 | 3 | 4>
              options={[
                { value: 2, label: "Large (2)" },
                { value: 3, label: "Medium (3)" },
                { value: 4, label: "Compact (4)" },
              ]}
              value={section.gridColumns ?? 3}
              onChange={(v) => onChange({ ...section, gridColumns: v })}
            />
          </FieldRow>

          <button
            onClick={onRemove}
            className="self-start text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: "var(--relay-fg-subtle)",
              border: "1px solid var(--relay-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#f87171";
              (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--relay-fg-subtle)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--relay-border)";
            }}
          >
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shop section row ──────────────────────────────────────────────────────────

function ShopSectionRow({
  section,
  onChange,
  onRemove,
}: {
  section: ShopSection;
  onChange: (s: ShopSection) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: "1px solid var(--relay-border)" }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-2"
        style={{ background: "var(--relay-surface-2)" }}
      >
        <GripVertical
          size={14}
          style={{ color: "var(--relay-fg-subtle)", cursor: "grab" }}
          className="shrink-0"
        />
        <button
          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          onClick={() => setExpanded((p) => !p)}
        >
          <ShoppingBag size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
          <span
            className="text-xs font-medium truncate"
            style={{
              color: section.visible
                ? "var(--relay-fg)"
                : "var(--relay-fg-subtle)",
            }}
          >
            {section.label}
          </span>
          <SectionKindChip kind="shop" />
          <span className="text-xs shrink-0" style={{ color: "var(--relay-fg-subtle)" }}>
            {section.items.length} items
          </span>
        </button>
        <button
          onClick={() => onChange({ ...section, visible: !section.visible })}
          className="shrink-0 p-1 rounded transition-colors"
          style={{
            color: section.visible
              ? "var(--relay-green-400)"
              : "var(--relay-fg-subtle)",
          }}
        >
          {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="shrink-0 p-1 rounded"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div
          className="px-3 py-3 flex flex-col gap-3"
          style={{
            background: "var(--relay-bg)",
            borderTop: "1px solid var(--relay-border)",
          }}
        >
          <FieldRow label="Section label">
            <InlineInput
              value={section.label}
              onChange={(v) => onChange({ ...section, label: v })}
            />
          </FieldRow>

          <FieldRow label="Grid columns">
            <PillSelect<"2" | "3" | "4">
              options={[
                { value: "2", label: "2 col" },
                { value: "3", label: "3 col" },
                { value: "4", label: "4 col" },
              ]}
              value={String(section.gridCols) as "2" | "3" | "4"}
              onChange={(v) =>
                onChange({ ...section, gridCols: Number(v) as 2 | 3 | 4 })
              }
            />
          </FieldRow>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--relay-fg-subtle)" }}>
              Items ({section.items.length})
            </span>
            {section.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                style={{
                  background: "var(--relay-surface-2)",
                  border: "1px solid var(--relay-border)",
                }}
              >
                <div
                  className="w-7 h-7 shrink-0 rounded bg-center bg-cover"
                  style={{ backgroundImage: `url(${item.imageUrl})` }}
                />
                <span
                  className="flex-1 truncate"
                  style={{ color: "var(--relay-fg-muted)" }}
                >
                  {item.title}
                </span>
                <span style={{ color: "var(--relay-fg-subtle)" }}>
                  {item.price}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={onRemove}
            className="self-start text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: "var(--relay-fg-subtle)",
              border: "1px solid var(--relay-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#f87171";
              (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--relay-fg-subtle)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--relay-border)";
            }}
          >
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Engagement section row ────────────────────────────────────────────────────

function EngagementSectionRow({
  section,
  onChange,
  onRemove,
}: {
  section: EngagementSection;
  onChange: (s: EngagementSection) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: "1px solid var(--relay-border)" }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-2"
        style={{ background: "var(--relay-surface-2)" }}
      >
        <GripVertical
          size={14}
          style={{ color: "var(--relay-fg-subtle)", cursor: "grab" }}
          className="shrink-0"
        />
        <button
          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          onClick={() => setExpanded((p) => !p)}
        >
          <span style={{ color: "#60a5fa" }}>
            {ENGAGEMENT_ICONS[section.blockType]}
          </span>
          <span
            className="text-xs font-medium truncate"
            style={{
              color: section.visible
                ? "var(--relay-fg)"
                : "var(--relay-fg-subtle)",
            }}
          >
            {section.label}
          </span>
          <SectionKindChip kind="engagement" />
        </button>
        <button
          onClick={() => onChange({ ...section, visible: !section.visible })}
          className="shrink-0 p-1 rounded transition-colors"
          style={{
            color: section.visible
              ? "var(--relay-green-400)"
              : "var(--relay-fg-subtle)",
          }}
        >
          {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="shrink-0 p-1 rounded"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div
          className="px-3 py-3 flex flex-col gap-3"
          style={{
            background: "var(--relay-bg)",
            borderTop: "1px solid var(--relay-border)",
          }}
        >
          <FieldRow label="Block type">
            <PillSelect<EngagementBlockType>
              options={[
                { value: "newsletter", label: "Newsletter" },
                { value: "commission", label: "Commissions" },
                { value: "contest",    label: "Contest" },
                { value: "links",      label: "Links" },
              ]}
              value={section.blockType}
              onChange={(v) =>
                onChange({
                  ...section,
                  blockType: v,
                  links: v === "links" ? section.links ?? [] : section.links
                })
              }
            />
          </FieldRow>

          <FieldRow label="Heading">
            <InlineInput
              value={section.heading}
              onChange={(v) => onChange({ ...section, heading: v })}
            />
          </FieldRow>

          <FieldRow label="Body text">
            <textarea
              value={section.body}
              onChange={(e) => onChange({ ...section, body: e.target.value })}
              rows={3}
              className="w-full text-xs px-2.5 py-1.5 rounded-md resize-none"
              style={{
                background: "var(--relay-surface-2)",
                border: "1px solid var(--relay-border)",
                color: "var(--relay-fg)",
                outline: "none",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--relay-green-600)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--relay-border)")
              }
            />
          </FieldRow>

          {section.blockType === "links" && section.links && (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-xs"
                style={{ color: "var(--relay-fg-subtle)" }}
              >
                Links
              </span>
              {section.links.map((link, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className="text-xs shrink-0 w-20 truncate"
                    style={{ color: "var(--relay-fg-muted)" }}
                  >
                    {link.platform}
                  </span>
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => {
                      const updated = [...section.links!];
                      updated[i] = { ...link, url: e.target.value };
                      onChange({ ...section, links: updated });
                    }}
                    className="flex-1 text-xs px-2 py-1 rounded-md"
                    style={{
                      background: "var(--relay-surface-2)",
                      border: "1px solid var(--relay-border)",
                      color: "var(--relay-fg)",
                      outline: "none",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "var(--relay-green-600)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "var(--relay-border)")
                    }
                  />
                  <button
                    onClick={() => {
                      const updated = section.links!.filter((_, j) => j !== i);
                      onChange({ ...section, links: updated });
                    }}
                    style={{ color: "var(--relay-fg-subtle)" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const updated = [
                    ...(section.links ?? []),
                    { platform: "Platform", url: "" },
                  ];
                  onChange({ ...section, links: updated });
                }}
                className="self-start text-xs flex items-center gap-1"
                style={{ color: "var(--relay-green-400)" }}
              >
                <Plus size={11} />
                Add link
              </button>
            </div>
          )}

          <button
            onClick={onRemove}
            className="self-start text-xs px-2 py-1 rounded"
            style={{
              color: "var(--relay-fg-subtle)",
              border: "1px solid var(--relay-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#f87171";
              (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--relay-fg-subtle)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--relay-border)";
            }}
          >
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Announcement section row ─────────────────────────────────────────────────

function AnnouncementRow({
  section,
  onChange,
  onRemove,
}: {
  section: AnnouncementBanner;
  onChange: (s: AnnouncementBanner) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const STYLE_COLOR: Record<AnnouncementBanner["style"], string> = {
    promo: "#f59e0b",
    info:  "#60a5fa",
    alert: "#f87171",
  };

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ border: "1px solid var(--relay-border)" }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-2"
        style={{ background: "var(--relay-surface-2)" }}
      >
        <GripVertical
          size={14}
          style={{ color: "var(--relay-fg-subtle)", cursor: "grab" }}
          className="shrink-0"
        />
        <button
          className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          onClick={() => setExpanded((p) => !p)}
        >
          <Bell size={12} style={{ color: STYLE_COLOR[section.style] }} />
          <span
            className="text-xs font-medium truncate"
            style={{
              color: section.visible
                ? "var(--relay-fg)"
                : "var(--relay-fg-subtle)",
            }}
          >
            {section.label}
          </span>
          <SectionKindChip kind="announcement" />
        </button>
        <button
          onClick={() => onChange({ ...section, visible: !section.visible })}
          className="shrink-0 p-1 rounded transition-colors"
          style={{
            color: section.visible
              ? "var(--relay-green-400)"
              : "var(--relay-fg-subtle)",
          }}
        >
          {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="shrink-0 p-1 rounded"
          style={{ color: "var(--relay-fg-subtle)" }}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div
          className="px-3 py-3 flex flex-col gap-3"
          style={{
            background: "var(--relay-bg)",
            borderTop: "1px solid var(--relay-border)",
          }}
        >
          <FieldRow label="Banner label">
            <InlineInput
              value={section.label}
              onChange={(v) => onChange({ ...section, label: v })}
            />
          </FieldRow>

          <FieldRow label="Message">
            <textarea
              value={section.message}
              onChange={(e) =>
                onChange({ ...section, message: e.target.value })
              }
              rows={2}
              className="w-full text-xs px-2.5 py-1.5 rounded-md resize-none"
              style={{
                background: "var(--relay-surface-2)",
                border: "1px solid var(--relay-border)",
                color: "var(--relay-fg)",
                outline: "none",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--relay-green-600)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--relay-border)")
              }
            />
          </FieldRow>

          <FieldRow label="Style">
            <PillSelect<AnnouncementBanner["style"]>
              options={[
                { value: "promo", label: "Promo" },
                { value: "info",  label: "Info"  },
                { value: "alert", label: "Alert" },
              ]}
              value={section.style}
              onChange={(v) => onChange({ ...section, style: v })}
            />
          </FieldRow>

          <FieldRow label="Auto-hide date (optional)">
            <input
              type="date"
              value={
                section.expiresAt
                  ? section.expiresAt.substring(0, 10)
                  : ""
              }
              onChange={(e) =>
                onChange({
                  ...section,
                  expiresAt: e.target.value
                    ? `${e.target.value}T23:59:00Z`
                    : null,
                })
              }
              className="w-full text-xs px-2.5 py-1.5 rounded-md"
              style={{
                background: "var(--relay-surface-2)",
                border: "1px solid var(--relay-border)",
                color: "var(--relay-fg)",
                outline: "none",
                colorScheme: "dark",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--relay-green-600)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--relay-border)")
              }
            />
          </FieldRow>

          <button
            onClick={onRemove}
            className="self-start text-xs px-2 py-1 rounded"
            style={{
              color: "var(--relay-fg-subtle)",
              border: "1px solid var(--relay-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#f87171";
              (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--relay-fg-subtle)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--relay-border)";
            }}
          >
            Remove banner
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Unified any-section row ──────────────────────────────────────────────────

function AnySectionRow({
  section,
  collections,
  onChange,
  onRemove,
}: {
  section: AnySection;
  collections: Collection[];
  onChange: (s: AnySection) => void;
  onRemove: () => void;
}) {
  if (section.kind === "library") {
    return (
      <LibrarySectionRow
        section={section}
        collection={collections.find(
          (c) => c.slug === section.collectionSlug
        )}
        collections={collections}
        onChange={onChange as (s: LibrarySection) => void}
        onRemove={onRemove}
      />
    );
  }
  if (section.kind === "shop") {
    return (
      <ShopSectionRow
        section={section}
        onChange={onChange as (s: ShopSection) => void}
        onRemove={onRemove}
      />
    );
  }
  if (section.kind === "engagement") {
    return (
      <EngagementSectionRow
        section={section}
        onChange={onChange as (s: EngagementSection) => void}
        onRemove={onRemove}
      />
    );
  }
  if (section.kind === "announcement") {
    return (
      <AnnouncementRow
        section={section}
        onChange={onChange as (s: AnnouncementBanner) => void}
        onRemove={onRemove}
      />
    );
  }
  return null;
}

// ─── Add section picker ───────────────────────────────────────────────────────

type AddableKind =
  | "library"
  | "library_catalog"
  | "shop"
  | "engagement"
  | "announcement";

const ADD_OPTIONS: {
  kind: AddableKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    kind: "library",
    label: "Library section",
    description: "Gallery grid sourced from one Library collection",
    icon: <Layers size={14} />,
    color: "var(--relay-green-400)",
  },
  {
    kind: "library_catalog",
    label: "All visible work",
    description:
      "Single section showing your full visible catalog (not tied to one collection)",
    icon: <Layers size={14} />,
    color: "#34d399",
  },
  {
    kind: "shop",
    label: "Shop",
    description: "Storefront row — link to prints, zines, or digital downloads",
    icon: <ShoppingBag size={14} />,
    color: "#f59e0b",
  },
  {
    kind: "engagement",
    label: "Engagement block",
    description: "Newsletter, commission news, contests, or social links",
    icon: <Users size={14} />,
    color: "#60a5fa",
  },
  {
    kind: "announcement",
    label: "Announcement banner",
    description: "Ribbon-style banner for sales or new releases — auto-expires",
    icon: <Megaphone size={14} />,
    color: "#f87171",
  },
];

function AddSectionPicker({
  collections,
  onAdd,
}: {
  collections: Collection[];
  onAdd: (s: AnySection) => void;
}) {
  const [open, setOpen] = useState(false);

  function createSection(kind: AddableKind): AnySection {
    const id = `sec_${crypto.randomUUID()}`;
    if (kind === "library") {
      return {
        kind: "library",
        id,
        label: "New section",
        collectionSlug: collections[0]?.slug ?? "recent-work",
        layout: "grid",
        itemLimit: 12,
        gridColumns: 3,
        visible: true,
      };
    }
    if (kind === "library_catalog") {
      return {
        kind: "library",
        id,
        label: "Work",
        collectionSlug: collections[0]?.slug ?? "",
        filterQuery: {},
        layout: "grid",
        itemLimit: 24,
        gridColumns: 3,
        visible: true,
      };
    }
    if (kind === "shop") {
      return {
        kind: "shop",
        id,
        label: "Shop",
        visible: true,
        gridCols: 3,
        items: [],
      };
    }
    if (kind === "engagement") {
      return {
        kind: "engagement",
        id,
        label: "Engagement",
        visible: true,
        blockType: "newsletter",
        heading: "Stay connected",
        body: "",
      };
    }
    return {
      kind: "announcement",
      id,
      label: "Announcement",
      visible: true,
      message: "New release — check it out!",
      expiresAt: null,
      style: "promo",
    };
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-center gap-1.5 w-full text-xs py-2 rounded-md transition-colors"
        style={{
          color: "var(--relay-green-400)",
          border: "1px dashed var(--relay-green-800)",
          background: "transparent",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "var(--relay-green-950)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <Plus size={13} />
        Add section
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 z-[200] flex max-h-[min(60vh,360px)] flex-col overflow-y-auto rounded-lg"
          style={{
            background: "var(--relay-surface-1)",
            border: "1px solid var(--relay-border)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 shrink-0"
            style={{ borderBottom: "1px solid var(--relay-border)" }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--relay-fg-muted)" }}
            >
              Add section
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ color: "var(--relay-fg-subtle)" }}
            >
              <X size={13} />
            </button>
          </div>
          {ADD_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              onClick={() => {
                onAdd(createSection(opt.kind));
                setOpen(false);
              }}
              className="flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
              style={{ borderBottom: "1px solid var(--relay-border)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--relay-surface-2)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "transparent")
              }
            >
              <span
                className="shrink-0 mt-0.5"
                style={{ color: opt.color }}
              >
                {opt.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--relay-fg)" }}
                >
                  {opt.label}
                </span>
                <span
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--relay-fg-subtle)" }}
                >
                  {opt.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sections panel ───────────────────────────────────────────────────────────

function SectionsPanel({
  sections,
  collections,
  onChange,
}: {
  sections: AnySection[];
  collections: Collection[];
  onChange: (sections: AnySection[]) => void;
}) {
  function updateSection(id: string, updated: AnySection) {
    onChange(sections.map((s) => (s.id === id ? updated : s)));
  }

  function removeSection(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }

  return (
    <>
      <div
        className="flex items-start gap-2 px-2.5 py-2 rounded-md text-xs leading-relaxed"
        style={{
          background: "var(--relay-green-950)",
          border: "1px solid var(--relay-green-800)",
          color: "var(--relay-fg-muted)",
        }}
      >
        <span
          style={{ color: "var(--relay-green-400)", marginTop: "1px" }}
        >
          <Layers size={12} />
        </span>
        <span>
          Library sections can show one collection or{" "}
          <strong style={{ color: "var(--relay-fg-muted)", fontWeight: 600 }}>
            all visible work
          </strong>{" "}
          (same catalog visitors see). Visibility and access tiers are set in Library — not here.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {sections.map((section) => (
          <AnySectionRow
            key={section.id}
            section={section}
            collections={collections}
            onChange={(s) => updateSection(section.id, s)}
            onRemove={() => removeSection(section.id)}
          />
        ))}
      </div>

      <AddSectionPicker
        collections={collections}
        onAdd={(s) => onChange([...sections, s])}
      />
    </>
  );
}

// ─── Inspector Rail ───────────────────────────────────────────────────────────

interface InspectorRailProps {
  layout: PageLayout;
  collections: Collection[];
  onLayoutChange: (updated: PageLayout) => void;
}

export function InspectorRail({
  layout,
  collections,
  onLayoutChange,
}: InspectorRailProps) {
  const [openPanel, setOpenPanel] = useState<"theme" | "hero" | "sections" | null>(
    null
  );

  function toggle(id: "theme" | "hero" | "sections") {
    setOpenPanel((prev) => (prev === id ? null : id));
  }

  return (
    <aside
      className="flex flex-col overflow-y-auto"
      style={{
        background: "var(--relay-surface-1)",
        borderRight: "1px solid var(--relay-border)",
        width: "100%",
        height: "100%",
      }}
      aria-label="Inspector"
    >
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--relay-border)" }}
      >
        <p className="text-xs" style={{ color: "var(--relay-fg-subtle)" }}>
          Inspector
        </p>
      </div>

      <PanelSection
        id="theme"
        label="Theme"
        icon={<Palette size={14} />}
        open={openPanel === "theme"}
        onToggle={() => toggle("theme")}
      >
        <ThemePanel
          theme={layout.theme}
          bio={layout.bio}
          onChange={(t) => onLayoutChange({ ...layout, theme: t })}
          onBioChange={(bio) => onLayoutChange({ ...layout, bio })}
        />
      </PanelSection>

      <PanelSection
        id="hero"
        label="Hero"
        icon={<LayoutTemplate size={14} />}
        open={openPanel === "hero"}
        onToggle={() => toggle("hero")}
      >
        <HeroPanel
          hero={layout.hero}
          onChange={(h) => onLayoutChange({ ...layout, hero: h })}
        />
      </PanelSection>

      <PanelSection
        id="sections"
        label="Sections"
        icon={<Layers size={14} />}
        open={openPanel === "sections"}
        onToggle={() => toggle("sections")}
      >
        <SectionsPanel
          sections={layout.sections}
          collections={collections}
          onChange={(sections) => onLayoutChange({ ...layout, sections })}
        />
      </PanelSection>
    </aside>
  );
}

