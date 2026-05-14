"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  FolderKanban,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import LibrarySectionEyebrow from "../components/LibrarySectionEyebrow";
import {
  commitManualImportStagingToLibrary,
  fetchManualImportSetup,
  fetchManualImportStaging,
  postManualImportSetup,
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  RELAY_API_BASE,
  type ManualImportSetupData,
  type ManualImportTierRow,
  type RelayLibraryStagingItem
} from "@/lib/relay-api";
import { guessRelayUploadContentType } from "@/lib/guess-relay-upload-content-type";
import { useStudioSession } from "@/lib/studio-session-context";

type BinDraft = {
  id: string;
  name: string;
  amount: string;
  sourceHint?: string;
  linkedRelayTierId: string;
};

const DEFAULT_BINS: BinDraft[] = [
  { id: "default-basic", name: "Basic", amount: "500", linkedRelayTierId: "" },
  { id: "default-advanced", name: "Advanced", amount: "1000", linkedRelayTierId: "" },
  { id: "default-vip", name: "VIP", amount: "2500", linkedRelayTierId: "" }
];

function priceLabel(cents: number | null | undefined): string {
  if (cents == null) return "No price";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}/mo`;
}

function setupToDrafts(setup: ManualImportSetupData | null): BinDraft[] {
  const source = setup?.manual_bins.length
    ? setup.manual_bins
    : setup?.suggestions.length
      ? setup.suggestions
      : [];
  if (!source.length) return DEFAULT_BINS;
  return source.slice(0, 12).map((tier, index) => ({
    id: `${tier.source}-${tier.relay_tier_id}-${index}`,
    name: tier.title,
    amount: tier.amount_cents == null ? "" : String(tier.amount_cents),
    sourceHint: tier.source,
    linkedRelayTierId:
      tier.source === "manual"
        ? (tier.linked_provider_relay_tier_id ?? "")
        : tier.relay_tier_id.startsWith("patreon_tier_") || tier.relay_tier_id.startsWith("substar_tier_")
          ? tier.relay_tier_id
          : ""
  }));
}

function stagingRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stagingBinTierId(value: unknown): string | null {
  const record = stagingRecord(value);
  const id = record?.bin_prisma_tier_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function stagingBinTitle(value: unknown): string | null {
  const record = stagingRecord(value);
  const title = record?.bin_title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function absoluteRelayUrl(path: string | undefined): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

function previewUrl(item: RelayLibraryStagingItem): string | null {
  const thumb =
    item.mime_type?.startsWith("image/") && item.thumb_url_path?.trim()
      ? item.thumb_url_path
      : item.content_url_path;
  return absoluteRelayUrl(thumb);
}

function ProviderContextCard({
  setup,
  loading
}: {
  setup: ManualImportSetupData | null;
  loading: boolean;
}) {
  const syncedCount = setup?.synced_tiers.length ?? 0;
  return (
    <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--lib-primary)_35%,var(--lib-border))] bg-[var(--lib-primary)]/10 text-[var(--lib-primary)]">
          <Sparkles size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lib-primary)]">
            Provider context
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--lib-fg)]">
            Folder bins map to real provider tiers.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)]">
            Uploads stay inside the selected bin first. When you are ready, commit all bin uploads to
            the Library Import Bay with their access metadata attached.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)]">
            SubscribeStar API sync may omit attachments or variants the GraphQL query does not return.
            Use bins and manual uploads to cover media the provider API cannot supply.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-3 py-1 text-[var(--lib-fg-muted)]">
              {loading
                ? "Checking connected providers..."
                : `${syncedCount} synced tier suggestion${syncedCount === 1 ? "" : "s"}`}
            </span>
            <span className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-3 py-1 text-[var(--lib-fg-muted)]">
              Library compose happens after commit
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TierBinBuilder({
  drafts,
  syncedLinkChoices,
  setup,
  saving,
  onChange,
  onSave,
  binsAlreadySaved,
  exitEditMode
}: {
  drafts: BinDraft[];
  syncedLinkChoices: ManualImportTierRow[];
  setup: ManualImportSetupData | null;
  saving: boolean;
  onChange: (rows: BinDraft[]) => void;
  onSave: () => void;
  binsAlreadySaved: boolean;
  exitEditMode?: () => void;
}) {
  const ready = (setup?.manual_bins.length ?? 0) > 0 && setup?.manual_campaign.ready;
  const linkOptions = useMemo(() => syncedLinkChoices.filter((t) => t.upload_enabled), [syncedLinkChoices]);
  const addBin = () =>
    onChange([...drafts, { id: `draft-${Date.now()}`, name: "", amount: "", linkedRelayTierId: "" }]);
  const patchBin = (id: string, patch: Partial<BinDraft>) =>
    onChange(drafts.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const removeBin = (id: string) => onChange(drafts.filter((row) => row.id !== id));

  return (
    <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lib-primary)]">
            Step 1
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--lib-fg)]">Confirm access bins</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)]">
            Name each folder, then link it to an existing synced Patreon or SubscribeStar tier row.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {binsAlreadySaved && exitEditMode ? (
            <button
              type="button"
              onClick={exitEditMode}
              className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-3 py-1 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45"
            >
              Cancel editing
            </button>
          ) : null}
          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              ready
                ? "border-[var(--lib-success)]/45 bg-[var(--lib-success)]/10 text-[var(--lib-fg)]"
                : "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg-muted)]"
            }`}
          >
            {ready ? "Bins ready" : "Needs setup"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {drafts.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-3 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/60 p-3 md:grid-cols-[1fr_minmax(0,11rem)_minmax(0,16rem)_auto]"
          >
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                Bin name
              </span>
              <input
                value={row.name}
                onChange={(event) => patchBin(row.id, { name: event.target.value })}
                placeholder={`Bin ${index + 1}`}
                className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none focus:ring-1 focus:ring-[var(--lib-ring)]"
              />
              {row.sourceHint === "synced" ? (
                <span className="text-[10px] text-[var(--lib-primary)]">Seed label from provider data</span>
              ) : null}
            </label>
            <div className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                Detected price
              </span>
              <div className="rounded-lg border border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-input)_72%,transparent)] px-3 py-2 text-sm text-[var(--lib-fg)]">
                {row.amount ? priceLabel(Number(row.amount)) : "No price detected"}
              </div>
            </div>
            <label className="grid gap-1 md:col-span-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                Provider tier link
              </span>
              <select
                value={row.linkedRelayTierId}
                onChange={(event) => patchBin(row.id, { linkedRelayTierId: event.target.value })}
                disabled={linkOptions.length === 0}
                className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-2 text-xs text-[var(--lib-fg)] outline-none focus:ring-1 focus:ring-[var(--lib-ring)] disabled:opacity-50"
              >
                <option value="">Not linked yet - uploads locked</option>
                {linkOptions.map((t) => (
                  <option key={t.relay_tier_id} value={t.relay_tier_id}>
                    {t.title} ({t.relay_tier_id})
                  </option>
                ))}
              </select>
              {linkOptions.length === 0 ? (
                <span className="text-[10px] text-[var(--lib-warning)]">
                  Sync provider tiers first so real tier ids exist.
                </span>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => removeBin(row.id)}
              disabled={drafts.length <= 1}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--lib-border)] px-3 py-2 text-xs text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:cursor-not-allowed disabled:opacity-40 md:self-center"
            >
              <Trash2 size={14} aria-hidden />
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addBin}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--lib-border)] px-3 py-2 text-sm text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
        >
          <Plus size={15} aria-hidden />
          Add bin
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--lib-primary)]/55 bg-[var(--lib-primary)]/20 px-4 py-2 text-sm font-semibold text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {saving ? <RefreshCw size={15} className="animate-spin" aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
          {ready ? "Save bin changes" : "Save bins"}
        </button>
      </div>
    </section>
  );
}

function StagedMediaThumb({ item }: { item: RelayLibraryStagingItem }) {
  const url = previewUrl(item);
  const isImage = item.mime_type?.startsWith("image/") ?? false;
  return (
    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)]">
      {isImage && url ? (
        <img src={url} alt={stagingBinTitle(item.manual_import_staging) ?? item.media_id} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--lib-fg-muted)]">
          <FileText size={22} aria-hidden />
        </div>
      )}
      <div className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/80">
        {item.mime_type ?? "media"}
      </div>
    </div>
  );
}

function ManualBinUploader({
  creatorId,
  bin,
  uploadReady,
  onUploadComplete,
  onError
}: {
  creatorId: string;
  bin: ManualImportTierRow;
  uploadReady: boolean;
  onUploadComplete: () => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const unlocked = bin.upload_enabled && uploadReady;

  const runUpload = async (list: FileList | null) => {
    if (!list?.length || !creatorId.trim()) return;
    if (!unlocked || !bin.tier_id) {
      onError("Link this folder to a synced provider tier row before uploading.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      for (const file of Array.from(list)) {
        const contentType = guessRelayUploadContentType(file);
        if (contentType === "application/octet-stream") {
          throw new Error(`"${file.name}" needs a recognizable extension (.jpg, .mp4, .png, ...).`);
        }
        const init = await relayNativeUploadInit({
          creator_id: creatorId.trim(),
          content_type: contentType,
          byte_size: file.size
        });
        const putCt = init.upload.headers["Content-Type"] ?? contentType;
        await putRelayNativeUpload(init.upload.url, file, putCt);
        await relayNativeUploadCommit({
          creator_id: creatorId.trim(),
          media_id: init.media_id,
          content_type: contentType,
          byte_size: file.size,
          manual_import_bin_tier_id: bin.tier_id
        });
      }
      onUploadComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--lib-border)] bg-[var(--lib-card)]/80 p-4">
      {!uploadReady ? (
        <p className="flex items-start gap-2 text-sm text-[var(--lib-warning)]">
          <Lock size={15} aria-hidden />
          Relay needs R2 configured before uploads can start.
        </p>
      ) : !bin.upload_enabled ? (
        <p className="flex items-start gap-2 text-sm text-[var(--lib-warning)]">
          <Lock size={15} aria-hidden />
          Link this bin to a real Patreon or SubscribeStar tier row before uploads unlock.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--lib-fg)]">
            Upload files for <span className="font-semibold">{bin.title}</span>. They will appear here first.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void runUpload(event.target.files)}
              disabled={busy}
              accept="image/*,video/*,audio/*,.pdf,.webp,.gif,.svg"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--lib-primary)]/55 bg-[var(--lib-primary)]/15 px-3 py-2 text-sm font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-55"
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
              {busy ? "Uploading..." : "Choose files..."}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SavedBinWorkspace({
  bins,
  stagedItems,
  uploadReady,
  creatorId,
  committing,
  onUploadComplete,
  onCommitToLibrary,
  onError
}: {
  bins: ManualImportTierRow[];
  stagedItems: RelayLibraryStagingItem[];
  uploadReady: boolean;
  creatorId: string;
  committing: boolean;
  onUploadComplete: () => void;
  onCommitToLibrary: () => void;
  onError: (message: string | null) => void;
}) {
  const stagedCount = stagedItems.length;
  return (
    <section className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lib-primary)]">Workspace</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--lib-fg)]">Bins are locked - upload per tier</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)]">
            Files stay visible inside their bin until you commit them to the Library Import Bay.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {bins.map((bin) => {
          const binItems = stagedItems.filter((item) => stagingBinTierId(item.manual_import_staging) === bin.tier_id);
          return (
            <div
              key={bin.tier_id}
              className="rounded-2xl border border-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-border))] bg-[var(--lib-muted)]/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">Bin</div>
                  <div className="text-lg font-semibold text-[var(--lib-fg)]">{bin.title}</div>
                  <div className="mt-1 text-xs text-[var(--lib-fg-muted)]">
                    {priceLabel(bin.amount_cents)} -{" "}
                    {bin.upload_enabled ? (
                      <span className="text-[var(--lib-success)]">Upload ready</span>
                    ) : (
                      <span className="text-[var(--lib-warning)]">Link a provider tier row to unlock</span>
                    )}
                  </div>
                  {bin.provider_tier_relay_id ? (
                    <div className="mt-2 break-all text-[10px] text-[var(--lib-fg-muted)]">
                      Access key:&nbsp;<code className="text-[var(--lib-fg)]">{bin.provider_tier_relay_id}</code>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1 text-xs text-[var(--lib-fg-muted)]">
                  {binItems.length} staged
                </div>
              </div>

              <ManualBinUploader
                creatorId={creatorId}
                bin={bin}
                uploadReady={uploadReady}
                onError={onError}
                onUploadComplete={onUploadComplete}
              />

              {binItems.length > 0 ? (
                <div className="mt-4 rounded-xl border border-[var(--lib-border)] bg-black/20 p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                    Staged in {bin.title}
                  </div>
                  <div className="flex max-w-full gap-3 overflow-x-auto pb-2">
                    {binItems.map((item) => (
                      <StagedMediaThumb key={item.media_id} item={item} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/40 p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--lib-fg)]">Ready for Library: {stagedCount} file{stagedCount === 1 ? "" : "s"}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--lib-fg-muted)]">
            Commit moves all bin-staged uploads into the Library Import Bay with access-bin metadata attached.
          </p>
        </div>
        <button
          type="button"
          disabled={committing || stagedCount === 0}
          onClick={onCommitToLibrary}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--lib-primary)]/55 bg-[var(--lib-primary)]/20 px-4 py-2 text-sm font-semibold text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {committing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          Commit to Library
        </button>
      </div>
    </section>
  );
}

function WorkflowChecklist({
  binsReady,
  uploadReady,
  r2Configured,
  stagedCount
}: {
  binsReady: boolean;
  uploadReady: boolean;
  r2Configured: boolean;
  stagedCount: number;
}) {
  const uploadBlockedByR2 = binsReady && !r2Configured;
  const rows = [
    { label: "Bins ready + provider links saved", done: binsReady },
    {
      label: uploadBlockedByR2 ? "Relay storage configured" : "Per-bin uploads available",
      done: uploadReady
    },
    { label: `Bin uploads staged (${stagedCount})`, done: stagedCount > 0 }
  ];
  return (
    <div className="grid gap-2 rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4 md:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-sm">
          {row.done ? (
            <CheckCircle2 size={16} className="text-[var(--lib-success)]" aria-hidden />
          ) : (
            <Circle size={16} className="text-[var(--lib-fg-muted)]" aria-hidden />
          )}
          <span className={row.done ? "text-[var(--lib-fg)]" : "text-[var(--lib-fg-muted)]"}>{row.label}</span>
        </div>
      ))}
      {uploadBlockedByR2 ? (
        <p className="col-span-full mt-2 text-xs leading-relaxed text-[var(--lib-warning)]">
          Bins + links saved. Uploads stay blocked until the Relay API loads R2.
        </p>
      ) : null}
    </div>
  );
}

export default function ManualImportPageClient() {
  const { creatorId } = useStudioSession();
  const [setup, setSetup] = useState<ManualImportSetupData | null>(null);
  const [drafts, setDrafts] = useState<BinDraft[]>(DEFAULT_BINS);
  const [binsEditing, setBinsEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stagedItems, setStagedItems] = useState<RelayLibraryStagingItem[]>([]);
  const [stagingLoading, setStagingLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const binsReady = Boolean(setup?.manual_campaign.ready && setup.manual_bins.length > 0);
  const r2Configured = Boolean(setup?.upload.r2_configured);
  const uploadReady = binsReady && r2Configured;
  const manualCampaignId = setup?.manual_campaign.campaign_id ?? null;
  const syncedLinkChoices = useMemo(() => setup?.synced_tiers ?? [], [setup]);
  const savedManualBins = useMemo<ManualImportTierRow[]>(() => setup?.manual_bins ?? [], [setup]);

  const loadSetup = useCallback(async () => {
    if (!creatorId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchManualImportSetup(creatorId);
      setSetup(data);
      setDrafts(setupToDrafts(data));
      if ((data.manual_bins?.length ?? 0) === 0) setBinsEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  const loadManualStaging = useCallback(async () => {
    if (!creatorId.trim()) return;
    setStagingLoading(true);
    try {
      const data = await fetchManualImportStaging(creatorId.trim());
      setStagedItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStagedItems([]);
    } finally {
      setStagingLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (binsReady) void loadManualStaging();
  }, [binsReady, loadManualStaging]);

  const saveBins = useCallback(async () => {
    if (!creatorId.trim()) {
      setError("Missing creator session.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await postManualImportSetup({
        creator_id: creatorId.trim(),
        bins: drafts.map((draft) => ({
          name: draft.name,
          amount_cents: draft.amount ? Number(draft.amount) : null,
          source_hint: draft.sourceHint ?? null,
          linked_provider_relay_tier_id: draft.linkedRelayTierId.trim() ? draft.linkedRelayTierId.trim() : null
        }))
      });
      setSetup(data);
      setDrafts(setupToDrafts(data));
      setBinsEditing(false);
      setMessage(
        data.upload.r2_configured
          ? "Bins + provider links saved. Upload into each tier card below."
          : "Bins + links saved. Uploads stay gated until Relay loads R2 config."
      );
      await loadManualStaging();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [creatorId, drafts, loadManualStaging]);

  const commitToLibrary = useCallback(async () => {
    if (!creatorId.trim()) return;
    setCommitting(true);
    setError(null);
    try {
      const out = await commitManualImportStagingToLibrary(creatorId.trim());
      await loadManualStaging();
      setMessage(
        out.committed_count > 0
          ? `Committed ${out.committed_count} file${out.committed_count === 1 ? "" : "s"} to the Library Import Bay.`
          : "No bin-staged files were waiting to commit."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }, [creatorId, loadManualStaging]);

  return (
    <main className="library-shell min-h-screen bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-[color-mix(in_srgb,var(--lib-primary)_22%,var(--lib-border))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--lib-primary)_18%,transparent),transparent_38%),var(--lib-card)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to Library
          </Link>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-end">
            <div>
              <LibrarySectionEyebrow label="Manual Relay Import" dense />
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-[var(--lib-fg)] sm:text-5xl">
                Upload into bins, then commit to Library.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--lib-fg-muted)] sm:text-base">
                Each file stays in the bin it was uploaded to, so it is clear what access tier it belongs to.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--lib-fg)]">
                <FolderKanban size={17} className="text-[var(--lib-primary)]" aria-hidden />
                Manual campaign
              </div>
              <p className="mt-2 break-all text-xs leading-5 text-[var(--lib-fg-muted)]">
                {manualCampaignId ?? "Created after bins are saved."}
              </p>
              {binsReady && !binsEditing ? (
                <button
                  type="button"
                  onClick={() => setBinsEditing(true)}
                  className="mt-3 w-full rounded-lg border border-[var(--lib-primary)]/40 px-3 py-2 text-xs font-semibold text-[var(--lib-fg)] hover:border-[var(--lib-primary)]"
                >
                  Adjust bins / provider links
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-[var(--lib-destructive)]/45 bg-[var(--lib-destructive)]/10 px-4 py-3 text-sm text-[var(--lib-fg)]">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-[var(--lib-success)]/45 bg-[var(--lib-success)]/10 px-4 py-3 text-sm text-[var(--lib-fg)]">
            {message}
          </div>
        ) : null}

        <ProviderContextCard setup={setup} loading={loading} />

        {!binsEditing && binsReady ? null : (
          <TierBinBuilder
            drafts={drafts}
            syncedLinkChoices={syncedLinkChoices}
            setup={setup}
            saving={saving}
            binsAlreadySaved={binsReady}
            exitEditMode={
              binsReady
                ? () => {
                    setBinsEditing(false);
                    if (setup) setDrafts(setupToDrafts(setup));
                  }
                : undefined
            }
            onChange={setDrafts}
            onSave={() => void saveBins()}
          />
        )}

        {!binsEditing && binsReady ? (
          <SavedBinWorkspace
            bins={savedManualBins}
            stagedItems={stagedItems}
            uploadReady={uploadReady}
            creatorId={creatorId}
            committing={committing}
            onError={setError}
            onUploadComplete={() => void loadManualStaging()}
            onCommitToLibrary={() => void commitToLibrary()}
          />
        ) : null}

        <WorkflowChecklist
          binsReady={binsReady}
          uploadReady={uploadReady}
          r2Configured={r2Configured}
          stagedCount={stagedItems.length}
        />

        {stagingLoading ? (
          <p className="text-center text-xs text-[var(--lib-fg-muted)]">Refreshing staged bin media...</p>
        ) : null}
      </div>
    </main>
  );
}
