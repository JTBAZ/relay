/**

 * @fileoverview Owner-scoped cross-post package assembly for Relay extension + Bluesky API.

 * @description Loads latest post content and Relay-controlled media export paths.

 */

import type { PrismaClient } from "@prisma/client";

import {

  MediaUpstreamStatus,

  PostSource,

  PostUpstreamStatus

} from "@prisma/client";

import { mergePostPresentation } from "../gallery/effective-presentation.js";

import { stripHtmlForSearch } from "../gallery/query.js";



export type BuildRelayCrossPostPackageInput = {

  postId: string;

  accountId: string;

};



export type RelayCrossPostPackageMedia = {

  media_id: string;

  filename: string;

  mime_type: string;

  content_url: string;

};



export type RelayCrossPostPackage = {

  relay_post_id: string;

  title: string;

  body_text: string;

  body_html?: string;

  media: RelayCrossPostPackageMedia[];

};



/** X compose package — text capped for tweet length; up to four image attachments. */

export type XCrossPostPackage = RelayCrossPostPackage & {

  post_text: string;

};



/** DeviantArt submit package — primary image + description + optional tags. */

export type DeviantArtCrossPostPackage = RelayCrossPostPackage & {

  tags: string[];

};



export type PatreonCrossPostPackageMedia = RelayCrossPostPackageMedia;

export type PatreonCrossPostPackage = RelayCrossPostPackage;



export type BuildRelayCrossPostPackageResult =

  | { status: "no_primary_creator" }

  | { status: "not_found" }

  | { status: "forbidden" }

  | { status: "ok"; package: RelayCrossPostPackage };



export type BuildPatreonCrossPostPackageResult = BuildRelayCrossPostPackageResult;

export type BuildXCrossPostPackageResult =

  | Exclude<BuildRelayCrossPostPackageResult, { status: "ok" }>

  | { status: "ok"; package: XCrossPostPackage };



export type BuildDeviantArtCrossPostPackageResult =

  | Exclude<BuildRelayCrossPostPackageResult, { status: "ok" }>

  | { status: "ok"; package: DeviantArtCrossPostPackage };



/** Relay export route used by the extension to fetch media bytes with its bearer token. */

export function crossPostMediaContentUrlPath(creatorId: string, mediaId: string): string {

  return `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;

}



const X_POST_TEXT_MAX = 280;

const X_IMAGE_MAX = 4;

const DEVIANTART_IMAGE_MAX = 1;



function filenameForMedia(mediaId: string, mimeType: string | null | undefined): string {

  const safeBase = mediaId.replace(/[^\w.-]+/g, "_");

  if (!mimeType?.trim()) {

    return safeBase;

  }

  const mime = mimeType.trim().toLowerCase();

  const ext =

    mime === "image/jpeg"

      ? ".jpg"

      : mime === "image/png"

        ? ".png"

        : mime === "image/gif"

          ? ".gif"

          : mime === "image/webp"

            ? ".webp"

            : mime.startsWith("image/")

              ? ".img"

              : "";

  return ext ? `${safeBase}${ext}` : safeBase;

}



function bodyFieldsFromDescription(

  description: string | undefined

): { body_text: string; body_html?: string } {

  const html = description?.trim() ?? "";

  if (!html) {

    return { body_text: "" };

  }

  const body_text = stripHtmlForSearch(html);

  const hasMarkup = /<[^>]+>/.test(html);

  if (hasMarkup && body_text !== html) {

    return { body_text, body_html: html };

  }

  return { body_text: body_text || html };

}



function isImageMimeType(mimeType: string | null | undefined): boolean {

  return Boolean(mimeType?.trim().toLowerCase().startsWith("image/"));

}



export function formatXPostText(title: string, bodyText: string, maxLen = X_POST_TEXT_MAX): string {

  const t = title.trim();

  const b = bodyText.trim();

  if (!t && !b) return "";

  if (!t) return b.length <= maxLen ? b : `${b.slice(0, maxLen - 1)}…`;

  if (!b) return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;

  const combined = `${t}\n\n${b}`;

  if (combined.length <= maxLen) return combined;

  return `${combined.slice(0, maxLen - 1)}…`;

}



export function formatBlueskyPostText(title: string, bodyText: string, maxLen = 300): string {

  return formatXPostText(title, bodyText, maxLen);

}



/**

 * Loads the latest `PostVersion` for an active Relay-native post owned by the account's

 * `primaryRelayCreatorId` and assembles a cross-post package.

 */

export async function buildRelayCrossPostPackage(

  prisma: PrismaClient,

  input: BuildRelayCrossPostPackageInput

): Promise<BuildRelayCrossPostPackageResult> {

  const postId = input.postId.trim();

  const accountId = input.accountId.trim();

  if (!postId || !accountId) {

    return { status: "not_found" };

  }



  const account = await prisma.account.findUnique({

    where: { id: accountId },

    select: { primaryRelayCreatorId: true }

  });

  const creatorId = account?.primaryRelayCreatorId?.trim() ?? "";

  if (!creatorId) {

    return { status: "no_primary_creator" };

  }



  const post = await prisma.post.findFirst({

    where: {

      id: postId,

      source: PostSource.RELAY,

      upstreamStatus: PostUpstreamStatus.active

    },

    include: {

      versions: { orderBy: { versionSeq: "desc" }, take: 1 },

      presentation: {

        select: {

          relayTitle: true,

          relayDescription: true,

          mediaOrder: true

        }

      }

    }

  });



  if (!post) {

    return { status: "not_found" };

  }

  if (post.creatorId !== creatorId) {

    return { status: "forbidden" };

  }



  const version = post.versions[0];

  if (!version) {

    return { status: "not_found" };

  }



  const merged = mergePostPresentation(

    {

      title: version.title,

      description: version.description ?? undefined,

      media_ids: version.mediaIds

    },

    post.presentation

      ? {

          relay_title: post.presentation.relayTitle,

          relay_description: post.presentation.relayDescription,

          media_order: post.presentation.mediaOrder

        }

      : null

  );



  const { body_text, body_html } = bodyFieldsFromDescription(merged.description);

  const mediaIds = merged.media_ids_ordered;



  const mediaRows =

    mediaIds.length === 0

      ? []

      : await prisma.mediaAsset.findMany({

          where: {

            id: { in: mediaIds },

            creatorId,

            upstreamStatus: MediaUpstreamStatus.active

          },

          select: {

            id: true,

            currentMimeType: true

          }

        });



  const byId = new Map(mediaRows.map((row) => [row.id, row]));

  const ordered = mediaIds

    .map((id) => byId.get(id))

    .filter((row): row is (typeof mediaRows)[number] => Boolean(row));



  const images = ordered.filter((row) => isImageMimeType(row.currentMimeType));

  const nonImages = ordered.filter((row) => !isImageMimeType(row.currentMimeType));



  const media: RelayCrossPostPackageMedia[] = [...images, ...nonImages].map((row) => ({

    media_id: row.id,

    filename: filenameForMedia(row.id, row.currentMimeType),

    mime_type: row.currentMimeType?.trim() || "application/octet-stream",

    content_url: crossPostMediaContentUrlPath(creatorId, row.id)

  }));



  const pkg: RelayCrossPostPackage = {

    relay_post_id: post.id,

    title: merged.title.trim(),

    body_text,

    media

  };

  if (body_html) {

    pkg.body_html = body_html;

  }



  return { status: "ok", package: pkg };

}



/** Patreon editor package (alias of shared builder). */

export async function buildPatreonCrossPostPackage(

  prisma: PrismaClient,

  input: BuildRelayCrossPostPackageInput

): Promise<BuildPatreonCrossPostPackageResult> {

  return buildRelayCrossPostPackage(prisma, input);

}



/** X compose package — tweet text + up to four image rows. */

export async function buildXCrossPostPackage(

  prisma: PrismaClient,

  input: BuildRelayCrossPostPackageInput

): Promise<BuildXCrossPostPackageResult> {

  const base = await buildRelayCrossPostPackage(prisma, input);

  if (base.status !== "ok") {

    return base;

  }

  const images = base.package.media.filter((m) => m.mime_type.toLowerCase().startsWith("image/"));

  return {

    status: "ok",

    package: {

      ...base.package,

      post_text: formatXPostText(base.package.title, base.package.body_text),

      media: images.slice(0, X_IMAGE_MAX)

    }

  };

}



/** DeviantArt submit package — title, description, primary image, optional tags. */

export async function buildDeviantArtCrossPostPackage(

  prisma: PrismaClient,

  input: BuildRelayCrossPostPackageInput

): Promise<BuildDeviantArtCrossPostPackageResult> {

  const base = await buildRelayCrossPostPackage(prisma, input);

  if (base.status !== "ok") {

    return base;

  }

  const images = base.package.media.filter((m) => m.mime_type.toLowerCase().startsWith("image/"));

  return {

    status: "ok",

    package: {

      ...base.package,

      media: images.slice(0, DEVIANTART_IMAGE_MAX),

      tags: []

    }

  };

}


