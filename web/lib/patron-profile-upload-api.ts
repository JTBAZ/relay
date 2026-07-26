import {
  putRelayNativeUpload,
  relayFetch,
} from "@/lib/relay-api";
import { guessPatronProfileImageContentType } from "@/lib/guess-patron-profile-image-content-type";

export type PatronProfileAssetKind = "avatar" | "banner";

type PatronProfileUploadInitData = {
  asset_id: string;
  storage_key: string;
  byte_size: number;
  upload: { method: "PUT"; url: string; headers: { "Content-Type": string } };
  expires_in_sec: number;
};

type PatronProfileUploadCommitData = {
  asset_id: string;
  public_url_path: string;
  content_length: number;
};

/** Presigned R2 upload for patron avatar or banner; returns absolute public content URL. */
export async function uploadPatronProfileImage(args: {
  kind: PatronProfileAssetKind;
  file: File;
}): Promise<string> {
  const contentType = guessPatronProfileImageContentType(args.file);
  if (!contentType.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPEG, WebP, or GIF).");
  }
  const init = await relayFetch<PatronProfileUploadInitData>(
    "/api/v1/profile/upload/init",
    {
      method: "POST",
      body: JSON.stringify({
        kind: args.kind,
        content_type: contentType,
        byte_size: args.file.size,
      }),
    }
  );
  await putRelayNativeUpload(init.upload.url, args.file, contentType);
  const committed = await relayFetch<PatronProfileUploadCommitData>(
    "/api/v1/profile/upload/commit",
    {
      method: "POST",
      body: JSON.stringify({
        kind: args.kind,
        asset_id: init.asset_id,
        content_type: contentType,
        byte_size: args.file.size,
      }),
    }
  );
  return committed.public_url_path;
}
