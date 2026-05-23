"use client";

import type { TierFacet } from "@/lib/relay-api";
import { PILOT_PERMISSION_AUDIENCE_HINT } from "@/lib/pilot-permission-copy";
import { AudienceAccessTierSelect } from "../audience-access-tier-select";

type Props = {
  creatorId: string;
  postId: string;
  accessTiers: TierFacet[];
  onSaved: () => Promise<void>;
};

export function InspectAudienceAccessEditor({
  creatorId,
  postId,
  accessTiers,
  onSaved
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-4 text-[var(--lib-fg-muted)]">
        {PILOT_PERMISSION_AUDIENCE_HINT} Patreon-synced posts may revert on the next scrape unless you change
        access again.
      </p>
      <AudienceAccessTierSelect
        creatorId={creatorId}
        postId={postId}
        accessTiers={accessTiers}
        onSaved={onSaved}
      />
    </div>
  );
}
