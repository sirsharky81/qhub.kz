/** Room lifetime — 60 minutes per spec. */
export const ROOM_TTL_SEC = 60 * 60;

export const MAX_PARTICIPANTS = 2;
export const MAX_SESSION_BYTES = 1024 * 1024 * 1024;
export const MAX_SIGNALS = 500;
export const CHUNK_SIZE_DEFAULT = 768 * 1024;

export const REDIS_ROOM_PREFIX = "share:room:";
export const REDIS_PARTICIPANT_PREFIX = "share:participant:";
export const REDIS_TOKEN_PREFIX = "share:token:";
export const REDIS_CODE_PREFIX = "share:code:";
export const REDIS_SIGNALS_PREFIX = "share:signals:";
export const REDIS_SIGNAL_SEQ_PREFIX = "share:signal-seq:";

export const FORBIDDEN_KEY_PARTS = ["history", "route", "track"] as const;

export const SESSION_STORAGE_KEY = "qhub_share_session";

export const SHARE_BASE_PATH = "/share";
export const SHARE_INVITE_PARAM = "t";
