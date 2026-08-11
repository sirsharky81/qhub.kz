export const SEND_REDIS_PREFIX = "send:";

export const REDIS_SHARE_PREFIX = `${SEND_REDIS_PREFIX}share:`;
export const REDIS_OWNER_PREFIX = `${SEND_REDIS_PREFIX}owner:`;

/** Forbidden key parts (collision guard with other services). */
export const FORBIDDEN_KEY_PARTS = ["history", "route", "track"] as const;

export type SendExpiryPreset = "1h" | "1d" | "7d";

export const SEND_EXPIRY_PRESETS: Record<SendExpiryPreset, number> = {
  "1h": 60 * 60,
  "1d": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
};

/** Default max upload size (500 MB). Override with SEND_MAX_BYTES. */
export const DEFAULT_SEND_MAX_BYTES = 500 * 1024 * 1024;

/** Share id length (e.g. Ab73kD). */
export const SHARE_ID_LENGTH = 6;

export const SHARE_ID_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
