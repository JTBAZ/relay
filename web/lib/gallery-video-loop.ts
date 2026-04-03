/** Persisted preference: loop MP4 (and other video) playback in gallery modals. */
export const GALLERY_VIDEO_LOOP_LS_KEY = "relay.galleryVideoLoop";

export function readGalleryVideoLoop(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GALLERY_VIDEO_LOOP_LS_KEY) === "1";
}

export function writeGalleryVideoLoop(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GALLERY_VIDEO_LOOP_LS_KEY, value ? "1" : "0");
}
