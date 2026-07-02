/** Copy shown when the viewer lacks tier access to a saved collection entry. */
export function patronCollectionLockedTierMessage(): string {
  return "Your current tier does not include this post.";
}

export function patronCollectionLockedTierSubscript(): string {
  return "Resubscribe to regain access";
}

export function countLockedCollectionEntriesForCreator(
  entries: ReadonlyArray<{
    creator_id: string;
    viewer_entitlement: { state: string };
  }>,
  creatorId: string
): number {
  return entries.filter(
    (entry) =>
      entry.creator_id === creatorId && entry.viewer_entitlement.state !== "visible"
  ).length;
}
