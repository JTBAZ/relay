/**
 * Cross-post trigger and package types shared by the background worker, storage, and content scripts.
 */

export const MSG_RELAY_CROSS_POST = "RELAY_CROSS_POST" as const;

export type CrossPostDestination = "patreon" | "x" | "deviantart";

export type CrossPostContentOverride = {
  title?: string;
  body_text?: string;
  post_text?: string;
  tags?: string[];
};

/** Relay web → extension externally-connectable trigger (post id only). */
export type ExternalCrossPostMessage = {
  type: typeof MSG_RELAY_CROSS_POST;
  relay_post_id: string;
  /** Defaults to patreon when omitted (backward compatible). */
  destination?: CrossPostDestination;
  /** Optional platform-specific edits made in Relay before opening the destination site. */
  content_override?: CrossPostContentOverride;
  /** When set, extension fetches package from distribution attempt route. */
  distribution_attempt_id?: string;
};

export type PatreonCrossPostMediaItem = {
  media_id: string;
  filename: string;
  mime_type: string;
  content_url: string;
};

/** Backend-authorized draft package returned by `GET /api/v1/extension/cross-post/patreon/:post_id`. */
export type PatreonCrossPostPackage = {
  relay_post_id: string;
  title: string;
  body_text: string;
  body_html?: string;
  media: PatreonCrossPostMediaItem[];
};

/** X compose package from `GET /api/v1/extension/cross-post/x/:post_id`. */
export type XCrossPostPackage = {
  relay_post_id: string;
  title: string;
  body_text: string;
  body_html?: string;
  post_text: string;
  media: PatreonCrossPostMediaItem[];
};

/** DeviantArt submit package from `GET /api/v1/extension/cross-post/deviantart/:post_id`. */
export type DeviantArtCrossPostPackage = {
  relay_post_id: string;
  title: string;
  body_text: string;
  body_html?: string;
  tags: string[];
  media: PatreonCrossPostMediaItem[];
};

export type PendingCrossPostPackage =
  | PatreonCrossPostPackage
  | XCrossPostPackage
  | DeviantArtCrossPostPackage;

/** Local storage key for a fetched package awaiting Patreon editor fill (see storage helpers). */
export const PENDING_CROSS_POST_STORAGE_KEY = "pending_cross_post" as const;

export class CrossPostSchemaError extends Error {
  public override readonly name = "CrossPostSchemaError";

  public constructor(message: string) {
    super(message);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isExternalCrossPostMessage(v: unknown): v is ExternalCrossPostMessage {
  if (v === null || typeof v !== "object" || !("type" in v) || !("relay_post_id" in v)) {
    return false;
  }
  const m = v as {
    type: unknown;
    relay_post_id: unknown;
    destination?: unknown;
    content_override?: unknown;
    distribution_attempt_id?: unknown;
  };
  if (m.type !== MSG_RELAY_CROSS_POST || !isNonEmptyString(m.relay_post_id)) {
    return false;
  }
  if (
    m.destination !== undefined &&
    m.destination !== null &&
    m.destination !== "patreon" &&
    m.destination !== "x" &&
    m.destination !== "deviantart"
  ) {
    return false;
  }
  if (m.content_override === undefined || m.content_override === null) {
    return true;
  }
  if (
    typeof m.content_override !== "object" ||
    Array.isArray(m.content_override)
  ) {
    return false;
  }
  const override = m.content_override as Record<string, unknown>;
  if (override.title !== undefined && !isString(override.title)) return false;
  if (override.body_text !== undefined && !isString(override.body_text)) return false;
  if (override.post_text !== undefined && !isString(override.post_text)) return false;
  if (override.tags !== undefined && (!Array.isArray(override.tags) || !override.tags.every(isString))) {
    return false;
  }
  if (
    m.distribution_attempt_id !== undefined &&
    m.distribution_attempt_id !== null &&
    !isNonEmptyString(m.distribution_attempt_id)
  ) {
    return false;
  }
  return true;
}

export function crossPostDestinationFromMessage(
  message: ExternalCrossPostMessage
): CrossPostDestination {
  if (message.destination === "x") return "x";
  if (message.destination === "deviantart") return "deviantart";
  return "patreon";
}

function parseMediaItem(raw: unknown, index: number): PatreonCrossPostMediaItem {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrossPostSchemaError(`media[${index}]: not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.media_id) || !isString(o.filename) || !isString(o.mime_type)) {
    throw new CrossPostSchemaError(`media[${index}]: missing or invalid fields`);
  }
  if (!isNonEmptyString(o.content_url)) {
    throw new CrossPostSchemaError(`media[${index}]: content_url required`);
  }
  return {
    media_id: o.media_id.trim(),
    filename: o.filename.trim(),
    mime_type: o.mime_type.trim(),
    content_url: o.content_url.trim()
  };
}

/** Parse and normalize a backend JSON package; throws {@link CrossPostSchemaError} on invalid shape. */
export function parsePatreonCrossPostPackage(raw: unknown): PatreonCrossPostPackage {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrossPostSchemaError("package: not an object");
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.relay_post_id) || !isString(o.title) || !isString(o.body_text)) {
    throw new CrossPostSchemaError("package: missing or invalid core fields");
  }
  if (o.body_html !== undefined && o.body_html !== null && !isString(o.body_html)) {
    throw new CrossPostSchemaError("package: body_html must be a string");
  }
  if (!Array.isArray(o.media)) {
    throw new CrossPostSchemaError("package: media must be an array");
  }

  const media = o.media.map((item, index) => parseMediaItem(item, index));
  const pkg: PatreonCrossPostPackage = {
    relay_post_id: o.relay_post_id.trim(),
    title: o.title.trim(),
    body_text: o.body_text.trim(),
    media
  };
  if (o.body_html !== undefined && o.body_html !== null) {
    pkg.body_html = o.body_html.trim();
  }
  return pkg;
}

/** Parse X compose package; throws {@link CrossPostSchemaError} on invalid shape. */
export function parseXCrossPostPackage(raw: unknown): XCrossPostPackage {
  const base = parsePatreonCrossPostPackage(raw);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrossPostSchemaError("package: not an object");
  }
  const o = raw as Record<string, unknown>;
  if (!isString(o.post_text)) {
    throw new CrossPostSchemaError("package: post_text required for X");
  }
  return {
    ...base,
    post_text: o.post_text.trim()
  };
}

export function isFillableXCrossPostPackage(pkg: XCrossPostPackage): boolean {
  return pkg.relay_post_id.trim().length > 0 && pkg.post_text.trim().length > 0;
}

/** Parse DeviantArt submit package; throws {@link CrossPostSchemaError} on invalid shape. */
export function parseDeviantArtCrossPostPackage(raw: unknown): DeviantArtCrossPostPackage {
  const base = parsePatreonCrossPostPackage(raw);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CrossPostSchemaError("package: not an object");
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.tags)) {
    throw new CrossPostSchemaError("package: tags required for DeviantArt");
  }
  const tags = o.tags.map((tag, index) => {
    if (typeof tag !== "string") {
      throw new CrossPostSchemaError(`tags[${index}]: must be a string`);
    }
    return tag.trim();
  });
  return { ...base, tags };
}

export function isFillableDeviantArtCrossPostPackage(
  pkg: DeviantArtCrossPostPackage
): boolean {
  return (
    pkg.relay_post_id.trim().length > 0 &&
    pkg.title.trim().length > 0 &&
    (pkg.body_text.trim().length > 0 || pkg.media.length > 0)
  );
}

/** Minimum fields required before attempting Patreon title/body fill. */
export function isFillablePatreonCrossPostPackage(pkg: PatreonCrossPostPackage): boolean {
  return (
    pkg.relay_post_id.trim().length > 0 &&
    pkg.title.trim().length > 0 &&
    pkg.body_text.trim().length > 0
  );
}
