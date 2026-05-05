"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ElementType } from "react";
import {
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Trash2,
  ImageIcon,
  Film,
  Music,
  FileText,
  Upload,
  Lock,
  Globe,
  Users,
  MessageCircle,
  MessageCircleOff,
  Eye,
  EyeOff,
  Layers
} from "lucide-react";
import type { ImportBinItem } from "./LibraryImportBay";
import type { Collection, TierFacet } from "@/lib/relay-api";

/** Sentinel: post is public (`is_public`); not a `Tier.id`. */
export const LIBRARY_CREATE_POST_PUBLIC_TIER = "__library_is_public__";

/** Library modal compose draft (UI state; Discord ids flow to `/new-post?media_ids=`). */
export type PostDraft = {
  title: string;
  tags: string[];
  collectionIds: string[];
  tierId: string;
  commentsEnabled: boolean;
  media: ImportBinItem[];
  tierPreviews: TierPreviewConfig[];
};

type TierOption = {
  id: string;
  label: string;
  priceCents: number;
};

type TierPreviewMode = "full" | "blur" | "locked";

type TierPreviewConfig = {
  tierId: string;
  mode: TierPreviewMode;
  blurAmount: number;
  teaser: string;
};

function buildTierCatalog(tierFacets: TierFacet[]): TierOption[] {
  const publicOpt: TierOption = {
    id: LIBRARY_CREATE_POST_PUBLIC_TIER,
    label: "Everyone",
    priceCents: 0
  };
  const sorted = [...tierFacets].sort((a, b) =>
    (a.title ?? a.tier_id).localeCompare(b.title ?? b.tier_id, undefined, { sensitivity: "base" })
  );
  const rest: TierOption[] = sorted.map((t) => ({
    id: t.tier_id,
    label: (t.title ?? t.tier_id).trim() || t.tier_id,
    priceCents: t.amount_cents ?? 0
  }));
  return [publicOpt, ...rest];
}

function buildDefaultTierPreviews(rows: TierOption[]): TierPreviewConfig[] {
  return rows.map((t) => ({
    tierId: t.id,
    mode: t.id === LIBRARY_CREATE_POST_PUBLIC_TIER ? "blur" : "full",
    blurAmount: 12,
    teaser: t.id === LIBRARY_CREATE_POST_PUBLIC_TIER ? "Become a member to see this" : ""
  }));
}

function accessTierIcon(t: TierOption): ElementType {
  if (t.id === LIBRARY_CREATE_POST_PUBLIC_TIER) return Globe;
  if (t.priceCents === 0) return Users;
  return Lock;
}

function mediaBadgeLabel(mimeType: string) {
  if (mimeType.startsWith("video/")) return { label: "VIDEO", icon: Film };
  if (mimeType.startsWith("audio/")) return { label: "AUDIO", icon: Music };
  if (mimeType.startsWith("text/")) return { label: "TEXT", icon: FileText };
  return { label: "IMAGE", icon: ImageIcon };
}

function priceFmt(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}/mo`;
}

function MediaThumb({ item, onRemove }: { item: ImportBinItem; onRemove: () => void }) {
  const { icon: Icon } = mediaBadgeLabel(item.mimeType);
  return (
    <div className="group/thumb relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-muted)]">
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / relay URLs
        <img src={item.src} alt={item.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon size={20} className="text-[var(--lib-fg-muted)]" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100"
        aria-label={`Remove ${item.filename}`}
      >
        <Trash2 size={14} className="text-[var(--lib-destructive)]" />
      </button>
    </div>
  );
}

function TierPreviewRow({
  tier,
  config,
  onChange
}: {
  tier: TierOption;
  config: TierPreviewConfig;
  onChange: (c: TierPreviewConfig) => void;
}) {
  const previewModes: { id: TierPreviewMode; label: string; icon: ElementType }[] = [
    { id: "full", label: "Full", icon: Eye },
    { id: "blur", label: "Blur", icon: EyeOff },
    { id: "locked", label: "Locked", icon: Lock }
  ];

  return (
    <div className="flex items-start gap-3 border-b border-[var(--lib-border)] py-2 last:border-0">
      <div className="w-28 shrink-0 pt-0.5">
        <p className="text-[11px] font-semibold text-[var(--lib-fg)]">{tier.label}</p>
        <p className="text-[9px] text-[var(--lib-fg-muted)]">{priceFmt(tier.priceCents)}</p>
      </div>

      <div className="flex gap-1">
        {previewModes.map((m) => {
          const Icon = m.icon;
          const active = config.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ ...config, mode: m.id })}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-all duration-100 ${
                active
                  ? "border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]"
                  : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:border-[color-mix(in_srgb,var(--lib-primary)_40%,var(--lib-border))] hover:text-[var(--lib-fg)]"
              }`}
            >
              <Icon size={10} />
              {m.label}
            </button>
          );
        })}
      </div>

      {config.mode === "blur" && (
        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={2}
            max={20}
            value={config.blurAmount}
            onChange={(e) => onChange({ ...config, blurAmount: Number(e.target.value) })}
            className="h-1 w-full accent-[var(--lib-primary)]"
          />
          <input
            type="text"
            value={config.teaser}
            onChange={(e) => onChange({ ...config, teaser: e.target.value })}
            placeholder="CTA text (e.g. Subscribe to see this)"
            className="flex-1 rounded border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1 text-[10px] text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] outline-none focus:ring-1 focus:ring-[var(--lib-ring)]"
          />
        </div>
      )}

      {config.mode === "locked" && (
        <input
          type="text"
          value={config.teaser}
          onChange={(e) => onChange({ ...config, teaser: e.target.value })}
          placeholder="CTA text (e.g. Patron-only — join to unlock)"
          className="flex-1 rounded border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1 text-[10px] text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] outline-none focus:ring-1 focus:ring-[var(--lib-ring)]"
        />
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  initialMedia: ImportBinItem[];
  /** Patreon / Relay tier catalog from `GET …/gallery/facets`. */
  tierFacets: TierFacet[];
  /** Creator library collections (`collection_id` + `title`). */
  collections: Pick<Collection, "collection_id" | "title">[];
  /** Existing tag ids from facets — powers suggestions; user can still type new tags. */
  tagSuggestions?: string[];
  onClose: () => void;
  /** Return `false` (or Promise<false>) to keep the modal open. */
  onPublish: (data: PostDraft) => void | boolean | Promise<void | boolean>;
};

export default function LibraryCreatePostModal({
  open,
  initialMedia,
  tierFacets,
  collections,
  tagSuggestions = [],
  onClose,
  onPublish
}: Props) {
  const tagListId = useId();
  const tierCatalog = useMemo(() => buildTierCatalog(tierFacets), [tierFacets]);
  const [title, setTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [tierId, setTierId] = useState(LIBRARY_CREATE_POST_PUBLIC_TIER);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [media, setMedia] = useState<ImportBinItem[]>(initialMedia);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [tierPreviews, setTierPreviews] = useState<TierPreviewConfig[]>(() => buildDefaultTierPreviews(buildTierCatalog(tierFacets)));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForOpen = useCallback(() => {
    const rows = buildTierCatalog(tierFacets);
    setMedia(initialMedia);
    setTitle("");
    setTags([]);
    setTagInput("");
    setCollectionIds([]);
    setTierId(LIBRARY_CREATE_POST_PUBLIC_TIER);
    setCommentsEnabled(true);
    setAdvancedOpen(false);
    setPublishing(false);
    setTierPreviews(buildDefaultTierPreviews(rows));
  }, [initialMedia, tierFacets]);

  useEffect(() => {
    if (open) resetForOpen();
  }, [open, resetForOpen]);

  useEffect(() => {
    if (!open) return;
    setTierPreviews((prev) => {
      const byId = new Map(prev.map((p) => [p.tierId, p]));
      return tierCatalog.map((row) => {
        const existing = byId.get(row.id);
        if (existing) return existing;
        return {
          tierId: row.id,
          mode: row.id === LIBRARY_CREATE_POST_PUBLIC_TIER ? ("blur" as TierPreviewMode) : ("full" as TierPreviewMode),
          blurAmount: 12,
          teaser: row.id === LIBRARY_CREATE_POST_PUBLIC_TIER ? "Become a member to see this" : ""
        };
      });
    });
  }, [open, tierCatalog]);

  useEffect(() => {
    if (!open) return;
    if (!tierCatalog.some((r) => r.id === tierId)) {
      setTierId(LIBRARY_CREATE_POST_PUBLIC_TIER);
    }
  }, [open, tierCatalog, tierId]);

  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
      if (!t || tags.includes(t)) return;
      setTags((prev) => [...prev, t]);
      setTagInput("");
    },
    [tags]
  );

  const removeTag = useCallback((t: string) => setTags((prev) => prev.filter((x) => x !== t)), []);

  const removeMedia = useCallback((id: string) => setMedia((prev) => prev.filter((m) => m.id !== id)), []);

  const handleAddFiles = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMedia((prev) => [
          ...prev,
          {
            id: `modal-${Date.now()}-${Math.random()}`,
            src: ev.target?.result as string,
            mimeType: file.type,
            filename: file.name,
            timestamp: new Date(),
            source: "upload"
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await onPublish({
        title,
        tags,
        collectionIds,
        tierId,
        commentsEnabled,
        media,
        tierPreviews
      });
      if (result === false) return;
      onClose();
    } finally {
      setPublishing(false);
    }
  }, [title, tags, collectionIds, tierId, commentsEnabled, media, tierPreviews, onPublish, onClose]);

  const toggleCollection = useCallback((id: string) => {
    setCollectionIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }, []);

  const selectedTier =
    tierCatalog.find((t) => t.id === tierId) ?? tierCatalog[0] ?? ({
      id: LIBRARY_CREATE_POST_PUBLIC_TIER,
      label: "Everyone",
      priceCents: 0
    } satisfies TierOption);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create new post"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--lib-border)_85%,transparent)] bg-[var(--lib-card)] shadow-2xl shadow-black/60">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--lib-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--lib-primary)]" aria-hidden />
            <span className="text-[13px] font-semibold tracking-tight text-[var(--lib-fg)]">New Post</span>
            <span className="ml-1 text-[10px] uppercase tracking-widest text-[var(--lib-fg-muted)]">
              {media.length} asset{media.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)]"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <section>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
              Media
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {media.map((item) => (
                <MediaThumb key={item.id} item={item} onRemove={() => removeMedia(item.id)} />
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--lib-border)] text-[var(--lib-fg-muted)] transition-all duration-150 hover:border-[var(--lib-primary)] hover:text-[var(--lib-primary)]"
                aria-label="Add more media"
              >
                <Upload size={14} aria-hidden />
                <span className="text-[9px] font-medium">Add more</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="sr-only"
                onChange={handleAddFiles}
              />
            </div>
          </section>

          <section>
            <label
              htmlFor="post-title"
              className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]"
            >
              Title
            </label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your post a title…"
              className="w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-[13px] text-[var(--lib-fg)] outline-none transition-all placeholder:text-[var(--lib-fg-muted)] focus:ring-1 focus:ring-[var(--lib-ring)]"
            />
          </section>

          <section>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
              Tags
            </label>
            <p className="mb-2 text-[9px] leading-relaxed text-[var(--lib-fg-muted)]">
              Suggestions mirror tags from your library facets. New labels are saved on this post version.
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-2 py-0.5 text-[11px] text-[var(--lib-fg)]"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-destructive)]"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X size={9} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <datalist id={tagListId}>
              {tagSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <input
              type="text"
              value={tagInput}
              list={tagListId}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
                if (e.key === "Backspace" && !tagInput && tags.length > 0) removeTag(tags[tags.length - 1]!);
              }}
              placeholder="Add a tag, press Enter"
              className="w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-[12px] text-[var(--lib-fg)] outline-none transition-all placeholder:text-[var(--lib-fg-muted)] focus:ring-1 focus:ring-[var(--lib-ring)]"
            />
          </section>

          <section>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
              Collections
            </label>
            <div className="flex flex-wrap gap-2">
              {collections.length === 0 ? (
                <p className="text-[11px] text-[var(--lib-fg-muted)]">No collections yet. Create one from the sidebar.</p>
              ) : (
                collections.map((col) => {
                  const active = collectionIds.includes(col.collection_id);
                  return (
                    <button
                      key={col.collection_id}
                      type="button"
                      onClick={() => toggleCollection(col.collection_id)}
                      className={`flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-100 ${
                        active
                          ? "border-[var(--lib-primary)] bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]"
                          : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] hover:text-[var(--lib-fg)]"
                      }`}
                      title={col.title}
                    >
                      <Layers size={10} aria-hidden className="shrink-0" />
                      <span className="truncate">{col.title}</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
              Access Tier
            </label>
            <div className="grid max-h-[min(40vh,420px)] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {tierCatalog.map((tierRow) => {
                const active = tierId === tierRow.id;
                const Icon = accessTierIcon(tierRow);
                return (
                  <button
                    key={tierRow.id}
                    type="button"
                    onClick={() => setTierId(tierRow.id)}
                    className={`flex min-h-[3.5rem] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-100 ${
                      active
                        ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_12%,transparent)] text-[var(--lib-fg)]"
                        : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:border-[color-mix(in_srgb,var(--lib-primary)_30%,var(--lib-border))] hover:text-[var(--lib-fg)]"
                    }`}
                  >
                    <Icon size={13} className={active ? "text-[var(--lib-primary)]" : "text-[var(--lib-fg-muted)]"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold leading-none">{tierRow.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">{priceFmt(tierRow.priceCents)}</p>
                    </div>
                    {active ? <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--lib-primary)]" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
              Comments
            </label>
            <p className="mb-2 text-[9px] text-[var(--lib-fg-muted)]">
              Per-post comments toggles aren&apos;t applied by the Relay API yet; this is queued for parity with composer.
            </p>
            <div className="flex gap-2">
              {[
                { val: true, label: "Enabled", Icon: MessageCircle },
                { val: false, label: "Disabled", Icon: MessageCircleOff }
              ].map(({ val, label, Icon }) => {
                const active = commentsEnabled === val;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCommentsEnabled(val)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium transition-all duration-100 ${
                      active
                        ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_12%,transparent)] text-[var(--lib-fg)]"
                        : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)] hover:border-[color-mix(in_srgb,var(--lib-primary)_25%,var(--lib-border))]"
                    }`}
                  >
                    <Icon size={12} className={active ? "text-[var(--lib-primary)]" : "text-[var(--lib-fg-muted)]"} />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--lib-border)]">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 transition-colors duration-100 hover:bg-[var(--lib-muted)]"
            >
              <div className="flex items-center gap-2">
                <Eye size={12} className="text-[var(--lib-fg-muted)]" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--lib-fg-muted)]">
                  Advanced — Tier Previews
                </span>
              </div>
              {advancedOpen ? (
                <ChevronUp size={13} className="text-[var(--lib-fg-muted)]" aria-hidden />
              ) : (
                <ChevronDown size={13} className="text-[var(--lib-fg-muted)]" aria-hidden />
              )}
            </button>

            {advancedOpen ? (
              <div className="border-t border-[var(--lib-border)] px-4 pb-3 pt-3">
                <p className="mb-3 text-[10px] leading-relaxed text-[var(--lib-fg-muted)]">
                  Control what each audience tier sees before gaining access. Blur the image with a CTA to invite
                  upgrades, or fully lock it.
                </p>
                {tierCatalog.map((tierRow) => {
                  const config = tierPreviews.find((tp) => tp.tierId === tierRow.id);
                  if (!config) return null;
                  return (
                    <TierPreviewRow
                      key={tierRow.id}
                      tier={tierRow}
                      config={config}
                      onChange={(updated) =>
                        setTierPreviews((prev) =>
                          prev.map((tp) => (tp.tierId === tierRow.id ? updated : tp))
                        )
                      }
                    />
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[var(--lib-border)] bg-[var(--lib-card)] px-5 py-3.5">
          <p className="text-[10px] text-[var(--lib-fg-muted)]">
            Visible to: <span className="font-medium text-[var(--lib-fg)]">{selectedTier.label}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={publishing}
              className="rounded-lg border border-[var(--lib-border)] px-4 py-2 text-[12px] font-medium text-[var(--lib-fg-muted)] transition-all hover:border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] hover:text-[var(--lib-fg)] disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={!title.trim() || media.length === 0 || publishing}
              className="rounded-lg bg-[var(--lib-primary)] px-5 py-2 text-[12px] font-semibold text-[var(--lib-primary-fg)] shadow-sm shadow-[color-mix(in_srgb,var(--lib-primary)_30%,transparent)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {publishing ? "Publishing…" : "Publish Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
