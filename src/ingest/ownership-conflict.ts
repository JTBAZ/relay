export type IngestOwnerConflict = {
  entity_type: "campaign" | "tier" | "post" | "media";
  entity_id: string;
  owner_creator_id: string;
};

/** Owner details are for operator logs and dead letters, never the public response. */
export class IngestOwnershipConflict extends Error {
  public readonly code = "INGEST_OWNERSHIP_CONFLICT";

  public constructor(public readonly conflict: IngestOwnerConflict) {
    super("Import stopped because an identifier belongs to another creator.");
    this.name = "IngestOwnershipConflict";
  }
}
