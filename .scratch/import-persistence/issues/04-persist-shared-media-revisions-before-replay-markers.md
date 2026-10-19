# 04: Persist shared-media revisions before replay markers

**What to build:** An accepted revision of a shared media asset survives saving and reloading, even when the asset's original post is unchanged. Replay protection must not mark an unpersisted media revision as processed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** Import persistence audit, finding 4. When a new post carries a fresh revision of an asset whose first post is preserved, database saving can skip the media update while committing its replay marker. Subsequent imports then suppress the missing update.

**Scope:** Persist accepted media changes independently of whether their original parent post is recreated. Keep media state and its replay marker in the same successful save. Preserve current URL revision guards, deletion and reactivation rules, provider/creator boundaries, and storage-key fallback behavior. No schema migration, general media framework, blob-cache redesign, or bulk redownload.

- [ ] Seed post p1 with asset revision m1. Import new post p2 carrying that asset at m2 while p1 stays unchanged. After database reload, the asset reflects m2 and the accepted post associations.
- [ ] Accepted media metadata, version history, and status persist consistently with the replay marker. A failed media write rolls back the save without recording m2 as processed.
- [ ] Replaying the accepted batch, or referencing m2 from another fresh post, retains the correct media state without duplicate media versions or publication events for replayed posts.
- [ ] Duplicate revision URL refreshes stay within the current revision. Older revisions cannot replace its download URL; duplicate revisions cannot reactivate deleted assets, while fresh revisions retain the existing reactivation behavior.
- [ ] Verify the shared-media persistence case for Patreon and SubscribeStar lanes while preserving creator ownership, Relay-native media, and existing storage-key fallback behavior.
- [ ] Run focused media replay, database reload, and deletion/reactivation checks plus scoped Ponytail Review before completion. Preserve unrelated work.
