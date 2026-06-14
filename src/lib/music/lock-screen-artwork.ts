/**
 * iOS lock screen загружает artwork отдельно от <img> в UI.
 * Blob URL, созданный пока приложение активно, надёжнее HTTP из SW-кэша.
 */
const PLACEHOLDER_PATH = "/track-placeholder.png";

let placeholderBlobUrl: string | null = null;
let prefetchPromise: Promise<string | null> | null = null;
let onArtworkReady: (() => void) | undefined;

/** Повторно выставить MediaMetadata после того как blob URL готов (iOS lock screen). */
export function setLockScreenArtworkRefreshHandler(handler: () => void): void {
  onArtworkReady = handler;
}

export function prefetchTrackPlaceholderArtwork(): void {
  if (typeof window === "undefined") return;
  if (placeholderBlobUrl || prefetchPromise) return;

  prefetchPromise = fetch(PLACEHOLDER_PATH, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`placeholder fetch ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      if (placeholderBlobUrl) URL.revokeObjectURL(placeholderBlobUrl);
      placeholderBlobUrl = URL.createObjectURL(blob);
      onArtworkReady?.();
      return placeholderBlobUrl;
    })
    .catch(() => null)
    .finally(() => {
      prefetchPromise = null;
    });
}

function placeholderHttpUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${PLACEHOLDER_PATH}`;
}

/** Несколько sizes — iOS выбирает подходящий; один src на все записи. */
export function buildPlaceholderArtwork(type = "image/png"): MediaImage[] {
  const src = placeholderBlobUrl ?? placeholderHttpUrl();
  const sizes = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"] as const;
  return sizes.map((sizes) => ({ src, sizes, type }));
}

export function buildCoverArtwork(coverArtUrl: string): MediaImage[] {
  const type = coverArtUrl.startsWith("blob:") ? "image/jpeg" : "image/jpeg";
  return [
    { src: coverArtUrl, sizes: "96x96", type },
    { src: coverArtUrl, sizes: "256x256", type },
    { src: coverArtUrl, sizes: "512x512", type },
  ];
}
