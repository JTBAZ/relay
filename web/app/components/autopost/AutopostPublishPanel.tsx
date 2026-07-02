"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  publishAutopostDraft,
  recordAutopostDistribution,
  type AutopostDraftWire
} from "@/lib/relay-api";
import { CreatorTierCatalogMultiselect } from "@/app/components/shell/CreatorTierCatalogMultiselect";
import { PublishToBlueskyButton } from "@/app/components/shell/PublishToBlueskyButton";
import { PublishToDeviantArtButton } from "@/app/components/shell/PublishToDeviantArtButton";
import { PublishToPatreonButton } from "@/app/components/shell/PublishToPatreonButton";
import { PublishToXButton } from "@/app/components/shell/PublishToXButton";

type Props = {
  creatorId: string;
  draft: AutopostDraftWire;
  title: string;
  bodyText: string;
  onPublished: (draft: AutopostDraftWire, postId: string) => void;
  onBack: () => void;
};

export function AutopostPublishPanel({
  creatorId,
  draft,
  title,
  bodyText,
  onPublished,
  onBack
}: Props) {
  const tierSectionId = useId();
  const [isPublic, setIsPublic] = useState(true);
  const [tierIds, setTierIds] = useState<string[]>([]);
  const [composeCampaignId, setComposeCampaignId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(draft.published_post_id);
  const [publishedDraft, setPublishedDraft] = useState<AutopostDraftWire | null>(
    draft.published_post_id ? draft : null
  );

  function setAccessPublic(nextPublic: boolean): void {
    setIsPublic(nextPublic);
    if (nextPublic) setTierIds([]);
  }

  async function onPublish() {
    if (!isPublic && tierIds.length === 0) {
      setError("Select at least one tier, or make the post public.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publishAutopostDraft(draft.draft_id, {
        is_public: isPublic,
        tier_ids: isPublic ? [] : tierIds,
        campaign_id: composeCampaignId ?? null,
        title: title.trim() || null,
        description: bodyText.trim() || null
      });
      setPublishedPostId(result.post_id);
      setPublishedDraft(result.draft);
      onPublished(result.draft, result.post_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function recordDistribution(
    destination: "patreon" | "x" | "bluesky" | "deviantart"
  ) {
    if (!publishedDraft) return;
    try {
      const { draft: next } = await recordAutopostDistribution(
        publishedDraft.draft_id,
        destination
      );
      setPublishedDraft(next);
    } catch {
      // Non-blocking once the handoff succeeded.
    }
  }

  if (publishedPostId && publishedDraft) {
    return (
      <div className="mx-auto max-w-2xl text-left">
        <div
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200"
          role="status"
        >
          <p className="font-medium">Published to Relay</p>
          <p className="mt-1 font-mono text-[11px]">{publishedPostId}</p>
          <p className="mt-2 text-emerald-100/90">
            Cross-post to connected platforms as separate steps — Relay never auto-publishes on Patreon,
            X, or DeviantArt.
          </p>
        </div>

        <div className="mt-4 space-y-4 rounded-md border border-[var(--lib-border)] bg-[var(--lib-card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Distribute
          </h3>
          <PublishToPatreonButton
            relayPostId={publishedPostId}
            onSuccess={() => void recordDistribution("patreon")}
          />
          <PublishToXButton
            relayPostId={publishedPostId}
            onSuccess={() => void recordDistribution("x")}
          />
          <PublishToDeviantArtButton
            relayPostId={publishedPostId}
            onSuccess={() => void recordDistribution("deviantart")}
          />
          <PublishToBlueskyButton
            relayPostId={publishedPostId}
            onSuccess={() => void recordDistribution("bluesky")}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/studio"
            className="inline-flex h-9 items-center rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-4 text-xs font-semibold text-[var(--lib-fg)]"
          >
            Back to Library
          </Link>
          <Link
            href="/studio/autopost"
            className="inline-flex h-9 items-center rounded-md bg-[var(--lib-primary)] px-4 text-xs font-semibold text-[var(--lib-primary-fg)]"
          >
            Start another Autopost
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl text-left">
      <h2 className="text-base font-semibold text-[var(--lib-fg)]">Publish to Relay</h2>
      <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
        Choose who can see this post on Relay. Patreon cross-post comes after publish.
      </p>

      {error ? (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <h3 id={tierSectionId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
          Access
        </h3>
        <CreatorTierCatalogMultiselect
          creatorId={creatorId}
          value={tierIds}
          onChange={setTierIds}
          isPublic={isPublic}
          onPublicChange={setAccessPublic}
          onCampaignChange={setComposeCampaignId}
          disabled={busy}
          aria-labelledby={tierSectionId}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onPublish()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--lib-primary)] px-4 text-xs font-semibold text-[var(--lib-primary-fg)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Publish to Relay
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="text-xs text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-50"
        >
          Back to draft
        </button>
      </div>
    </div>
  );
}
