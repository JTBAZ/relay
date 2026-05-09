/**
 * @fileoverview Minimal JSON:API TypeScript mirrors for Patreon API v2 responses (`data`, `included`, pagination links).
 * @description Align with Patreon JSON:API envelopes; not exhaustive of all Patreon resource types.
 * @see {@link ../jsdoc-core-entities.ts} (`PatreonJsonApiResource`, `PatreonJsonApiDocument` conceptual parity)
 * @see {@link https://docs.patreon.com/#apiv2-api}
 */

/** Single JSON:API primary or included resource from Patreon. */
export type JsonApiResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> | null }
  >;
};

/** Top-level Patreon JSON:API document (campaigns list, posts page, webhook payloads, …). */
export type JsonApiDocument = {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  links?: { next?: string | null };
  meta?: { pagination?: { cursors?: { next?: string | null } } };
};
