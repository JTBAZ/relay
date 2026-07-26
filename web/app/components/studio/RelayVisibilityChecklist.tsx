"use client";

import { useMemo, useState } from "react";
import {
  relayFetch,
  type GalleryItem,
  type VisibilityAxisAction
} from "@/lib/relay-api";
import { PILOT_PERMISSION_VISIBILITY_HINT } from "@/lib/pilot-permission-copy";
import {
  axisActionFromHiddenToggle,
  axisActionFromMatureToggle,
  planPostVisibilityAxisWrite,
  postVisibilitySwitchState
} from "@/lib/relay-visibility-post-adapter";
import { VisibilitySwitchRow } from "@/app/components/studio/VisibilitySwitchRow";

const HERO_ACCENT = "#9bf0c4";

type Props = {
  creatorId: string;
  postItems: GalleryItem[];
  studioWriteBlocked: boolean;
  onRefresh: () => Promise<void>;
};

/**
 * Layer C — Hidden / Adult for every asset on the post (Hero Access checklist).
 * Writes only via POST `/api/v1/gallery/visibility` (no tier_ids).
 */
export default function RelayVisibilityChecklist({
  creatorId,
  postItems,
  studioWriteBlocked,
  onRefresh
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchState = useMemo(() => postVisibilitySwitchState(postItems), [postItems]);

  const applyAxis = async (action: VisibilityAxisAction) => {
    if (studioWriteBlocked || busy || postItems.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const plan = planPostVisibilityAxisWrite(creatorId, postItems, action);
      for (const req of plan.requests) {
        await relayFetch<unknown>("/api/v1/gallery/visibility", {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify(req.body)
        });
      }
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1" data-relay-visibility-checklist>
      <p className="px-3 text-[10px] leading-relaxed text-[#6a726e]">
        {PILOT_PERMISSION_VISIBILITY_HINT}
      </p>
      {studioWriteBlocked ? (
        <p className="mx-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-100/90">
          Sync must be healthy before changing Relay visibility.
        </p>
      ) : null}
      {error ? (
        <p className="mx-3 rounded-lg border border-red-800/50 bg-red-950/40 px-2 py-1.5 text-[10px] text-red-200">
          {error}
        </p>
      ) : null}
      <VisibilitySwitchRow
        label="Hidden"
        helper="Off gallery for patrons; you still see it in Library"
        state={switchState.hidden}
        busy={busy}
        disabled={studioWriteBlocked || postItems.length === 0}
        accentColor={HERO_ACCENT}
        title="Applies to every asset on this post"
        onToggle={(nextOn) => void applyAxis(axisActionFromHiddenToggle(nextOn))}
      />
      <div className="mx-3 h-px bg-[#1a1a1a]" role="separator" />
      <VisibilitySwitchRow
        label="Adult (18+)"
        helper="Mature content rating on Relay (not Patreon tier access)"
        state={switchState.mature}
        busy={busy}
        disabled={studioWriteBlocked || switchState.matureDisabled || postItems.length === 0}
        accentColor={HERO_ACCENT}
        title={
          switchState.matureDisabled
            ? "Unhide first — hidden posts cannot be rated while off-gallery"
            : "Applies to every asset; hidden rows stay hidden"
        }
        onToggle={(nextOn) => void applyAxis(axisActionFromMatureToggle(nextOn))}
      />
    </div>
  );
}
