/**
 * Previewizer display fonts — preload before canvas bake for cross-OS consistency.
 */

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@700&family=Playfair+Display:wght@700&display=swap";

let preloadPromise: Promise<void> | null = null;

export async function preloadPreviewizerFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    if (!document.querySelector(`link[data-previewizer-fonts="true"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = GOOGLE_FONTS_HREF;
      link.setAttribute("data-previewizer-fonts", "true");
      document.head.appendChild(link);
      await new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
      });
    }
    try {
      await Promise.all([
        document.fonts.load('700 48px "Bebas Neue"'),
        document.fonts.load('700 48px "Oswald"'),
        document.fonts.load('700 48px "Playfair Display"')
      ]);
    } catch {
      /* system fallbacks still apply */
    }
  })();

  return preloadPromise;
}
