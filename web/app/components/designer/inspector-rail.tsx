"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Rows3,
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
  X,
  Link2,
  Mail,
  Trophy,
  Brush,
  Bell,
  Loader2
} from "lucide-react";
import type {
  PageLayout,
  HeroConfig,
  SectionLayout,
  Collection,
  AnySection,
  LibrarySection,
  ShopSection,
  EngagementSection,
  AnnouncementBanner,
  EngagementBlockType,
  PatreonLinkPosition
} from "@/lib/designer-mock";
import { LIBRARY_ALL_VISIBLE_SLUG } from "@/lib/designer-mock";
import {
  patchCreatorProfile,
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  RELAY_API_BASE
} from "@/lib/relay-api";

function guessHeroMediaContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function designerExportMediaUrl(creatorId: string, mediaId: string): string {
  return `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

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

function libraryBlockRole(section: LibrarySection): string {
  if (section.filterQuery !== undefined) {
    const q = section.filterQuery;
    const keys = Object.keys(q);
    if (keys.length === 1 && q.sort === "published") return "Newest";
    if (keys.length === 0) return section.layout === "featured" ? "Featured" : "All work";
    return "Filtered";
  }
  return section.layout === "featured" ? "Featured" : "Collection";
}

// ─── Hero (profile cues) ─────────────────────────────────────────────────────

function HeroPanelShell({
  layout,
  creatorId,
  onLayoutChange,
  onDesignerAvatarSynced,
}: {
  layout: PageLayout;
  creatorId: string;
  onLayoutChange: (p: PageLayout) => void;
  onDesignerAvatarSynced?: (avatarExportUrl: string) => void;
}) {
  useEffect(() => {
    if (layout.theme.lockedArtStyle !== "paywall") return;
    onLayoutChange({
      ...layout,
      theme: { ...layout.theme, lockedArtStyle: "blurred" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way guard
  }, [layout.theme.lockedArtStyle]);

  return (
    <>
      <HeroPanel
        hero={layout.hero}
        creatorId={creatorId}
        avatarUrl={layout.avatarUrl}
        onChange={(h) => onLayoutChange({ ...layout, hero: h })}
        onAvatarExportUrl={(url) => {
          onLayoutChange({ ...layout, avatarUrl: url });
          onDesignerAvatarSynced?.(url);
        }}
      />
      <ToggleRow
        label="Show bio"
        sublabel="Saved with your Relay layout (sync does not overwrite Patreon copy here)"
        value={layout.theme.showBio}
        onChange={(v) =>
          onLayoutChange({ ...layout, theme: { ...layout.theme, showBio: v } })
        }
      />
      {layout.theme.showBio ? (
        <FieldRow label="Bio">
          <BioTextarea
            value={layout.bio}
            onChange={(bio) => onLayoutChange({ ...layout, bio })}
            placeholder="A few lines about you or your work…"
          />
        </FieldRow>
      ) : null}
      <ToggleRow
        label="Show Patreon link"
        sublabel="Uses your Library campaign slug when synced"
        value={layout.theme.showPatreonLink}
        onChange={(v) =>
          onLayoutChange({ ...layout, theme: { ...layout.theme, showPatreonLink: v } })
        }
      />
      {layout.theme.showPatreonLink ? (
        <FieldRow label="Primary CTA placement" sublabel="Where the patron link sits on your hero">
          <PillSelect<PatreonLinkPosition>
            options={[
              { value: "below_avatar", label: "Below avatar" },
              { value: "below_bio", label: "Below bio" },
            ]}
            value={layout.theme.patreonLinkPosition ?? "below_bio"}
            onChange={(v) =>
              onLayoutChange({
                ...layout,
                theme: { ...layout.theme, patreonLinkPosition: v },
              })
            }
          />
        </FieldRow>
      ) : null}
      <ToggleRow
        label="Tier badges"
        sublabel="Shows access level on unlocked tiles — locked previews stay blurred or gated"
        value={layout.theme.showTierBadges}
        onChange={(v) =>
          onLayoutChange({ ...layout, theme: { ...layout.theme, showTierBadges: v } })
        }
      />
    </>
  );
}

// ─── Hero panel ───────────────────────────────────────────────────────────────

function HeroPanel({
  hero,
  creatorId,
  avatarUrl: _avatarUrl,
  onChange,
  onAvatarExportUrl,
}: {
  hero: HeroConfig;
  creatorId: string;
  avatarUrl: string;
  onChange: (h: HeroConfig) => void;
  onAvatarExportUrl: (exportUrl: string) => void;
}) {
  void _avatarUrl;
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [assetErr, setAssetErr] = useState<string | null>(null);

  async function runRelayImageUpload(file: File): Promise<string> {
    const cid = creatorId.trim();
    if (!cid) throw new Error("Missing creator session.");
    const contentType = guessHeroMediaContentType(file);
    if (contentType === "application/octet-stream") {
      throw new Error("Use a .jpg, .png, or .webp image.");
    }
    const init = await relayNativeUploadInit({
      creator_id: cid,
      content_type: contentType,
      byte_size: file.size,
    });
    const ct = init.upload.headers["Content-Type"] ?? contentType;
    await putRelayNativeUpload(init.upload.url, file, ct);
    await relayNativeUploadCommit({
      creator_id: cid,
      media_id: init.media_id,
      content_type: contentType,
      byte_size: file.size,
    });
    return init.media_id;
  }

  return (
    <>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setAssetErr(null);
          setCoverBusy(true);
          try {
            const mediaId = await runRelayImageUpload(file);
            const exportUrl = designerExportMediaUrl(creatorId.trim(), mediaId);
            onChange({
              ...hero,
              coverMediaId: mediaId,
              coverUrl: exportUrl,
              showCover: true,
            });
          } catch (err) {
            setAssetErr(err instanceof Error ? err.message : String(err));
          } finally {
            setCoverBusy(false);
          }
        }}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setAssetErr(null);
          setAvatarBusy(true);
          try {
            const mediaId = await runRelayImageUpload(file);
            const exportUrl = designerExportMediaUrl(creatorId.trim(), mediaId);
            await patchCreatorProfile({ avatar_url: exportUrl });
            onAvatarExportUrl(exportUrl);
          } catch (err) {
            setAssetErr(err instanceof Error ? err.message : String(err));
          } finally {
            setAvatarBusy(false);
          }
        }}
      />

      {assetErr ? (
        <p className="text-[10px] leading-snug" style={{ color: "#f87171" }}>
          {assetErr}
        </p>
      ) : null}

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
      {hero.showAvatar ? (
        <div
          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs"
          style={{
            background: "var(--relay-surface-2)",
            border: "1px solid var(--relay-border)",
            color: "var(--relay-fg-muted)",
          }}
        >
          <span className="truncate max-w-[10rem]">Profile photo</span>
          <button
            type="button"
            disabled={avatarBusy || !creatorId.trim()}
            onClick={() => avatarInputRef.current?.click()}
            className="flex items-center gap-1 shrink-0 text-xs transition-colors disabled:opacity-40"
            style={{ color: "var(--relay-green-400)" }}
          >
            {avatarBusy ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />}
            Change
          </button>
        </div>
      ) : null}
      <ToggleRow
        label="Cover image"
        sublabel="Relay site hero banner — saved on gallery layout (separate from Patreon sync)"
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
          <span className="truncate max-w-[10rem]">
            {hero.coverMediaId?.trim()
              ? `Cover · ${hero.coverMediaId.slice(0, 10)}…`
              : "Synced / default banner"}
          </span>
          <button
            type="button"
            disabled={coverBusy || !creatorId.trim()}
            onClick={() => coverInputRef.current?.click()}
            className="flex items-center gap-1 shrink-0 text-xs transition-colors disabled:opacity-40"
            style={{ color: "var(--relay-green-400)" }}
          >
            {coverBusy ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />}
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

const BLOCK_COLOR = {
  collection: "#60a5fa",
  announcement: "#f87171"
} as const;

type ComposerBlockKind = "collection" | "announcement";
type PendingBlockPlacement = { kind: ComposerBlockKind; insertIndex: number };

const DESIGNER_BLOCK_MIME = "application/x-relay-designer-block";

function dragBlockPayload(kind: ComposerBlockKind) {
  return JSON.stringify({ source: "designer-block-palette", kind });
}

function BlockTypeButton({
  label,
  description,
  kind,
  color,
  selected,
  onClick,
  onDragStart,
}: {
  label: string;
  description: string;
  kind: ComposerBlockKind;
  color: string;
  selected: boolean;
  onClick: () => void;
  onDragStart: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(DESIGNER_BLOCK_MIME, dragBlockPayload(kind));
      }}
      className="group rounded-lg border px-2.5 py-2 text-left transition-colors"
      style={{
        borderColor: selected ? color : `${color}66`,
        background: selected ? `${color}1a` : "var(--relay-bg)",
      }}
      title="Drag this block type into the minimap"
    >
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="min-w-0 truncate text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          {label}
        </span>
      </span>
      <span className="mt-1 block text-[10px] leading-snug" style={{ color: "var(--relay-fg-subtle)" }}>
        {description}
      </span>
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          <span
            className="text-[0.6rem] font-semibold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
            style={{
              color: "var(--relay-green-400)",
              border: "1px solid var(--relay-green-800)",
              background: "rgba(20,83,45,0.18)",
            }}
          >
            {libraryBlockRole(section)}
          </span>
          {section.filterQuery !== undefined ? (
            <span className="text-[10px] shrink-0 truncate max-w-[8rem]" style={{ color: "var(--relay-fg-subtle)" }}>
              Library catalog
            </span>
          ) : (
            collection && (
              <span
                className="text-xs shrink-0 truncate max-w-[10rem]"
                style={{
                  color: TIER_COLOR[collection.tier] ?? "var(--relay-fg-subtle)",
                }}
              >
                {collection.tier !== "public" && <Lock size={9} className="inline mr-0.5" />}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// ─── Sections panel ───────────────────────────────────────────────────────────

function SectionsPanel({
  sections,
  collections,
  pendingBlockPlacement,
  onPendingBlockPlacementChange,
  onChange,
}: {
  sections: AnySection[];
  collections: Collection[];
  pendingBlockPlacement: PendingBlockPlacement | null;
  onPendingBlockPlacementChange: (placement: PendingBlockPlacement | null) => void;
  onChange: (sections: AnySection[]) => void;
}) {
  const [blockKind, setBlockKind] = useState<ComposerBlockKind>("collection");
  const [collectionSlug, setCollectionSlug] = useState(collections[0]?.slug ?? "");
  const [announcementLabel, setAnnouncementLabel] = useState("Announcement");
  const [announcementMessage, setAnnouncementMessage] = useState("");

  useEffect(() => {
    if (collectionSlug || collections.length === 0) return;
    setCollectionSlug(collections[0]?.slug ?? "");
  }, [collectionSlug, collections]);

  useEffect(() => {
    if (!pendingBlockPlacement) return;
    setBlockKind(pendingBlockPlacement.kind);
  }, [pendingBlockPlacement]);

  const selectedCollection = collections.find((c) => c.slug === collectionSlug);
  const canCreate =
    Boolean(pendingBlockPlacement) &&
    (blockKind === "collection" ? Boolean(selectedCollection) : announcementMessage.trim().length > 0);

  function createBlock() {
    if (!canCreate || !pendingBlockPlacement) return;
    const insertIndex = Math.max(0, Math.min(pendingBlockPlacement.insertIndex, sections.length));
    if (blockKind === "collection" && selectedCollection) {
      const next = [...sections];
      next.splice(insertIndex, 0, {
        kind: "library",
        id: `sec_${crypto.randomUUID()}`,
        label: selectedCollection.label,
        collectionSlug: selectedCollection.slug,
        layout: "grid",
        itemLimit: 16,
        gridColumns: 3,
        visible: true,
      });
      onChange(next);
      onPendingBlockPlacementChange(null);
      return;
    }

    const next = [...sections];
    next.splice(insertIndex, 0, {
      kind: "announcement",
      id: `sec_${crypto.randomUUID()}`,
      label: announcementLabel.trim() || "Announcement",
      visible: true,
      message: announcementMessage.trim(),
      expiresAt: null,
      style: "info",
    });
    onChange(next);
    onPendingBlockPlacementChange(null);
    setAnnouncementMessage("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg border p-3"
        style={{ borderColor: "var(--relay-border)", background: "var(--relay-bg)" }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          1. Drag media type into map
        </p>
        <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--relay-fg-subtle)" }}>
          Drop a Collection or Post where it should land. The minimap will mark the pending slot.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BlockTypeButton
            label="Collection"
            description="A saved Library collection"
            kind="collection"
            color={BLOCK_COLOR.collection}
            selected={blockKind === "collection"}
            onClick={() => setBlockKind("collection")}
            onDragStart={() => setBlockKind("collection")}
          />
          <BlockTypeButton
            label="Post"
            description="Text / announcement block"
            kind="announcement"
            color={BLOCK_COLOR.announcement}
            selected={blockKind === "announcement"}
            onClick={() => setBlockKind("announcement")}
            onDragStart={() => setBlockKind("announcement")}
          />
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ borderColor: "var(--relay-border)", background: "var(--relay-bg)" }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          2. Fill out menu
        </p>
        <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--relay-fg-subtle)" }}>
          {pendingBlockPlacement
            ? `Pending ${pendingBlockPlacement.kind === "collection" ? "Collection" : "Post"} at position ${pendingBlockPlacement.insertIndex + 1}.`
            : "Drag a block type into the minimap before creating."}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {blockKind === "collection" ? (
            <FieldRow label="Collection">
              <select
                value={collectionSlug}
                onChange={(e) => setCollectionSlug(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-md"
                style={{
                  background: "var(--relay-surface-2)",
                  border: "1px solid var(--relay-border)",
                  color: "var(--relay-fg)",
                  outline: "none",
                }}
              >
                {collections.length === 0 ? (
                  <option value="">No collections yet</option>
                ) : (
                  collections.map((collection) => (
                    <option key={collection.slug} value={collection.slug}>
                      {collection.label} ({collection.itemCount})
                    </option>
                  ))
                )}
              </select>
            </FieldRow>
          ) : (
            <>
              <FieldRow label="Post label">
                <InlineInput
                  value={announcementLabel}
                  onChange={setAnnouncementLabel}
                  placeholder="Announcement"
                />
              </FieldRow>
              <FieldRow label="Text">
                <BioTextarea
                  value={announcementMessage}
                  onChange={setAnnouncementMessage}
                  placeholder="Write the message that should appear in this block…"
                />
              </FieldRow>
            </>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ borderColor: "var(--relay-border)", background: "var(--relay-bg)" }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          3. Create in indicated position
        </p>
        <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--relay-fg-subtle)" }}>
          Create inserts the finished block directly into the pending minimap slot.
        </p>
        <button
          type="button"
          disabled={!canCreate}
          onClick={createBlock}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40"
          style={{
            color: "white",
            background: canCreate ? "var(--relay-green-600)" : "var(--relay-border)",
          }}
        >
          <Plus size={13} />
          Create
        </button>
      </div>
    </div>
  );
}

// ─── Inspector Rail ───────────────────────────────────────────────────────────

interface InspectorRailProps {
  layout: PageLayout;
  collections: Collection[];
  creatorId: string;
  pendingBlockPlacement: PendingBlockPlacement | null;
  onPendingBlockPlacementChange: (placement: PendingBlockPlacement | null) => void;
  onLayoutChange: (updated: PageLayout) => void;
  onDesignerAvatarSynced?: (avatarExportUrl: string) => void;
}

export function InspectorRail({
  layout,
  collections,
  creatorId,
  pendingBlockPlacement,
  onPendingBlockPlacementChange,
  onLayoutChange,
  onDesignerAvatarSynced,
}: InspectorRailProps) {
  const [openPanel, setOpenPanel] = useState<"hero" | "arrange" | null>("hero");

  function toggle(id: "hero" | "arrange") {
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
        <p className="text-xs font-medium" style={{ color: "var(--relay-fg)" }}>
          Profile builder
        </p>
        <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--relay-fg-subtle)" }}>
          Hero settings and draggable media blocks
        </p>
      </div>

      <PanelSection
        id="hero"
        label="Hero"
        icon={<Sparkles size={14} />}
        open={openPanel === "hero"}
        onToggle={() => toggle("hero")}
      >
        <HeroPanelShell
          layout={layout}
          creatorId={creatorId}
          onLayoutChange={onLayoutChange}
          onDesignerAvatarSynced={onDesignerAvatarSynced}
        />
      </PanelSection>

      <PanelSection
        id="arrange"
        label="Arrange"
        icon={<Rows3 size={14} />}
        open={openPanel === "arrange"}
        onToggle={() => toggle("arrange")}
      >
        <SectionsPanel
          sections={layout.sections}
          collections={collections}
          pendingBlockPlacement={pendingBlockPlacement}
          onPendingBlockPlacementChange={onPendingBlockPlacementChange}
          onChange={(sections) => onLayoutChange({ ...layout, sections })}
        />
      </PanelSection>
    </aside>
  );
}

