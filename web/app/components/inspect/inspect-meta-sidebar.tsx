"use client";



import { Eye, FolderPlus, Layers3, Tags } from "lucide-react";

import type { GalleryItem, GalleryPostDetail, PostVisibility, TierFacet } from "@/lib/relay-api";
import { PILOT_PERMISSION_HEADLINE, PILOT_PERMISSION_VISIBILITY_HINT } from "@/lib/pilot-permission-copy";

import { InspectAudienceAccessEditor } from "./inspect-audience-access-editor";

const VIS_LABEL: Record<PostVisibility, string> = {
  visible: "Visible",
  hidden: "Hidden",
  review: "Mature (18+)"
};



type Props = {

  preview: GalleryItem;

  previewDetail: GalleryPostDetail | null;

  accessTiers: TierFacet[];

  creatorId: string;

  postId: string;

  onPresentationUpdated: () => Promise<void>;

};



export function InspectMetaSidebar({

  preview,

  previewDetail,

  accessTiers,

  creatorId,

  postId,

  onPresentationUpdated

}: Props) {

  const tagIds = previewDetail?.tag_ids ?? preview.tag_ids;



  const relayVisibility = preview.visibility;

  return (

    <div className="space-y-4 px-4 py-4 text-sm text-[var(--lib-fg)]">

      <section className="space-y-2">

        <div className="flex items-center gap-2">

          <Eye className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />

          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">

            Relay visibility

          </p>

        </div>

        <p className="text-[11px] font-medium leading-snug text-[var(--lib-fg)]">{PILOT_PERMISSION_HEADLINE}</p>

        <p className="text-[11px] leading-4 text-[var(--lib-fg-muted)]">{PILOT_PERMISSION_VISIBILITY_HINT}</p>

        <span className="inline-flex rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)] px-2.5 py-1 text-xs text-[var(--lib-fg)]">

          {VIS_LABEL[relayVisibility] ?? relayVisibility}

        </span>

      </section>

      <section>

        <div className="mb-2 flex items-center gap-2">

          <Layers3 className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />

          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">

            Audience access

          </p>

        </div>

        <InspectAudienceAccessEditor

          creatorId={creatorId}

          postId={postId}

          accessTiers={accessTiers}

          onSaved={onPresentationUpdated}

        />

      </section>



      <section className="space-y-2">

        <div className="flex items-center gap-2">

          <Tags className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />

          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">

            Tags and collections

          </p>

        </div>

        {tagIds.length > 0 ? (

          <div className="flex flex-wrap gap-1">

            {tagIds.slice(0, 12).map((t) => (

              <span key={t} className="rounded bg-[var(--lib-muted)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]">

                {t}

              </span>

            ))}

          </div>

        ) : (

          <p className="text-[11px] text-[var(--lib-fg-muted)]">No Relay tags yet.</p>

        )}

        <div className="flex flex-wrap gap-2">

          <button type="button" className="rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45">

            Add Tags

          </button>

          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-1.5 text-xs text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45">

            <FolderPlus className="h-3.5 w-3.5" aria-hidden />

            Add to Collection

          </button>

        </div>

      </section>

    </div>

  );

}

