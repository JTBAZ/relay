export type ExportMediaRecord = {
  media_id: string;
  creator_id: string;
  sha256: string;
  byte_length: number;
  relative_blob_path: string;
  upstream_revision: string;
  mime_type?: string;
  exported_at: string;
  upstream_url?: string;
};

export type CreatorExportIndex = {
  creator_id: string;
  media: Record<string, ExportMediaRecord>;
};

export type ExportOneResult = {
  media_id: string;
  creator_id: string;
  sha256: string;
  byte_length: number;
  idempotent_skip: boolean;
};
