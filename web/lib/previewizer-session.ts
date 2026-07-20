/**

 * Previewizer port — domain-neutral session/result types.

 * Distribution/Autopost map Relay URLs and uploads at the adapter boundary.

 */



export type PreviewizerSession = {

  creatorId: string;

  postId: string;

  sourceMediaId: string;

  sourceImageUrl: string;

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

}): PreviewizerSession {

  return {

    creatorId: args.creatorId,

    postId: args.postId,

    sourceMediaId: args.sourceMediaId,

    sourceImageUrl: args.sourceImageUrl,

  };

}

