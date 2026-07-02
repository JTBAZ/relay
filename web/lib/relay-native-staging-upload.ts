import { guessRelayUploadContentType } from "@/lib/guess-relay-upload-content-type";
import {
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  RelayApiError,
} from "@/lib/relay-api";

export type RelayStagingUploadResult = {
  media_id: string;
  content_type: string;
  filename: string;
  byte_size: number;
};

export type RelayStagingUploadBatchResult = {
  uploaded: RelayStagingUploadResult[];
  errors: string[];
};

export async function uploadFileToRelayStaging(args: {
  creatorId: string;
  file: File;
}): Promise<RelayStagingUploadResult> {
  const creatorId = args.creatorId.trim();
  if (!creatorId) {
    throw new Error("Sign in to upload files to your Library.");
  }
  const contentType = guessRelayUploadContentType(args.file);
  if (contentType === "application/octet-stream") {
    throw new Error(
      `Could not determine media type for “${args.file.name}”. Use a recognizable extension (.png, .jpg, .mp4, …).`
    );
  }
  const init = await relayNativeUploadInit({
    creator_id: creatorId,
    content_type: contentType,
    byte_size: args.file.size,
  });
  const putCt = init.upload.headers["Content-Type"] ?? contentType;
  await putRelayNativeUpload(init.upload.url, args.file, putCt);
  await relayNativeUploadCommit({
    creator_id: creatorId,
    media_id: init.media_id,
    content_type: contentType,
    byte_size: args.file.size,
  });
  return {
    media_id: init.media_id,
    content_type: contentType,
    filename: args.file.name,
    byte_size: args.file.size,
  };
}

export async function uploadFilesToRelayStaging(args: {
  creatorId: string;
  files: File[];
}): Promise<RelayStagingUploadBatchResult> {
  const uploaded: RelayStagingUploadResult[] = [];
  const errors: string[] = [];
  for (const file of args.files) {
    try {
      uploaded.push(await uploadFileToRelayStaging({ creatorId: args.creatorId, file }));
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      errors.push(`Upload failed for “${file.name}”: ${msg}`);
    }
  }
  return { uploaded, errors };
}
