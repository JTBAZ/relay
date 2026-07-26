/**
 * QR generation for tracked offer links — encodes Relay `/go/:slug` URL only.
 */

import QRCode from "qrcode";

export async function offerTrackedLinkQrDataUrl(
  trackedUrl: string,
  format: "svg" | "png" = "png"
): Promise<string> {
  const url = trackedUrl.trim();
  if (!url) throw new Error("Tracked URL is required for QR.");
  if (format === "svg") {
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 256 });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return QRCode.toDataURL(url, { margin: 1, width: 256, type: "image/png" });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
