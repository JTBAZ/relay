/**
 * Previewizer port — domain-neutral session/result types.
 * Distribution/Autopost map Relay URLs and uploads at the adapter boundary.
 */

import type { PreviewTemplateConfigV1 } from "./previewizer-template-config";

export type PreviewizerSession = {
  creatorId: string;
  postId: string;
  sourceMediaId: string;
  sourceImageUrl: string;
  /**
   * Optional saved-template snapshot (Automations / approval preload).
   * Applied once after source image mount; never includes crop/selection.
   * Omit for ordinary callers.
   */
  initialTemplateConfig?: PreviewTemplateConfigV1;
};

export type PreviewizerResult = {
  previewMediaId: string;
};

/** Injected by Autopost/adapter — Previewizer must not import Relay upload. */
export type PreviewizerUploadPreview = (blob: Blob) => Promise<{ mediaId: string }>;

export type PreviewizerMode = "standalone" | "distribution";

export function buildPreviewizerSession(args: {
  creatorId: string;
  postId: string;
  sourceMediaId: string;
  sourceImageUrl: string;
  initialTemplateConfig?: PreviewTemplateConfigV1;
}): PreviewizerSession {
  const session: PreviewizerSession = {
    creatorId: args.creatorId,
    postId: args.postId,
    sourceMediaId: args.sourceMediaId,
    sourceImageUrl: args.sourceImageUrl
  };
  if (args.initialTemplateConfig !== undefined) {
    session.initialTemplateConfig = args.initialTemplateConfig;
  }
  return session;
}
