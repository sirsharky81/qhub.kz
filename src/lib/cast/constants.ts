/** Stream token lifetime — 4 hours. */
export const CAST_STREAM_TTL_SEC = 4 * 60 * 60;

/** Upload metadata lifetime in Redis. */
export const CAST_UPLOAD_TTL_SEC = CAST_STREAM_TTL_SEC;

export const CAST_REDIS_PREFIX = "cast:";

export const CAST_UPLOAD_REDIS_PREFIX = `${CAST_REDIS_PREFIX}upload:`;

export const CAST_STREAM_STARTED_PREFIX = `${CAST_REDIS_PREFIX}stream-started:`;

export const CAST_BASE_PATH = "/cast";

/** Default Google Cast Media Receiver (public). */
export const CAST_DEFAULT_RECEIVER_ID = "CC1AD845";

export const CAST_MAX_UPLOAD_BYTES_MOBILE = 500 * 1024 * 1024;
export const CAST_MAX_UPLOAD_BYTES_DESKTOP = 2 * 1024 * 1024 * 1024;

export const VIDEO_MIME_PREFIX = "video/";

export const DIRECT_MEDIA_EXTENSIONS = [".mp4", ".m3u8", ".mpd", ".webm", ".mov", ".mkv"] as const;
