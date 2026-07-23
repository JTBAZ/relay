/**
 * Ownership packet types (EH-080).
 * Env names / inventory only — productionSafe remains false.
 */

export const OWNERSHIP_PACKET_CONTRACT =
  "escape-hatch-ownership-packet/1.0.0" as const;

export const WARRANTY_DAYS = 90 as const;

export type CredentialInventoryRow = {
  env_name: string;
  category: string;
  purpose: string;
  ownership: "creator" | "optional_relay";
  rotation_hint: string;
  estimated_cost_owner: string;
};

export type OptionalRelayDisclosure = {
  id: string;
  title: string;
  required_for_native_ops: false;
  revocable: true;
  detail: string;
};

export type WarrantyBoundary = {
  handoff_at: string;
  warranty_ends_at: string;
  days: typeof WARRANTY_DAYS;
  covered: string[];
  excluded: string[];
  paid_support_note: string;
};

export type OwnershipPacketDocument = {
  contract_version: typeof OWNERSHIP_PACKET_CONTRACT;
  site_id: string;
  generated_at: string;
  production_safe: false;
  manifesto: {
    title: string;
    bullets: string[];
    relay_chassis_rights: string;
    creator_license: string;
  };
  source_package: {
    chassis_version: string;
    schema_version: string;
    slice: string;
    manifest_path: string;
    build_commands: string[];
    test_commands: string[];
    ops_doc: string;
    ownership_doc: string;
  };
  data_media_inventory: {
    note: string;
    artifact_paths: string[];
    parity_report_present: boolean;
    patron_pii_excluded: true;
  };
  credentials: CredentialInventoryRow[];
  optional_relay_services: OptionalRelayDisclosure[];
  independence: {
    native_without_relay: string;
    optional_addons: string;
    live_independence_proof: "deferred_eh_082";
  };
  warranty: WarrantyBoundary;
  operating_guide_pointers: string[];
  redaction_note: string;
};

export type OwnershipPacketStateDocument = {
  contract_version: "escape-hatch-ownership-state/1.0.0";
  site_id: string;
  production_safe: false;
  updated_at: string;
  last_generated_at: string | null;
  packet_path: string | null;
  last_error: string | null;
};
