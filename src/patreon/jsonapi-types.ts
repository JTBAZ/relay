/** Minimal JSON:API shapes returned by Patreon API v2. */

export type JsonApiResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> | null }
  >;
};

export type JsonApiDocument = {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  links?: { next?: string | null };
  meta?: { pagination?: { cursors?: { next?: string | null } } };
};
