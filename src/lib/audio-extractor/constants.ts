/** Hard max duration in seconds (10 minutes). */
export const MAX_DURATION_SEC = 600;

/** Soft warning threshold (5 minutes). */
export const SOFT_DURATION_WARN_SEC = 300;

/** Max streamed audio size in bytes (80 MB). */
export const MAX_STREAM_BYTES = 80 * 1024 * 1024;

/** Max decoded audio in browser (100 MB, aligned with music-editor). */
export const MAX_DECODED_BYTES = 100 * 1024 * 1024;

export const CONSENT_STORAGE_KEY = "qhub-audio-extractor-consent";

export const SUPPORTED_PLATFORMS = ["youtube", "tiktok", "instagram"] as const;
