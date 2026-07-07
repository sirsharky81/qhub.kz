export const ROOM_TTL_SEC = 60 * 60 * 24;
export const MEMBER_TTL_SEC = 60 * 60 * 24;
export const LOC_TTL_SEC = 60 * 60 * 24;
export const BIND_TTL_SEC = 60 * 15;
export const SOS_TTL_SEC = 60 * 60 * 24 * 30;
export const PUSH_TTL_SEC = 60 * 60 * 24 * 30;
export const LOC_REQUEST_TTL_SEC = 300;
export const LOC_REQUEST_COOLDOWN_SEC = 60;

export const REDIS_ROOM_PREFIX = "family:room:";
export const REDIS_MEMBER_PREFIX = "family:member:";
export const REDIS_LOC_PREFIX = "family:loc:";
export const REDIS_BIND_PREFIX = "family:bind:";
export const REDIS_PAIR_PREFIX = "family:pair:";
export const REDIS_SOS_PREFIX = "family:sos:";
export const REDIS_PUSH_PREFIX = "family:push:";
export const REDIS_LOC_REQ_PREFIX = "family:loc-req:";
export const FAMILY_NATIVE_PUSH_TOKEN_KEY = "qhub_family_native_push_token";

export const PAIR_TTL_SEC = 60 * 15;

export const FORBIDDEN_KEY_PARTS = ["history", "route", "track"] as const;

export const PARENT_SESSION_STORAGE_KEY = "qhub_family_parent_session";
export const CHILD_SESSION_STORAGE_KEY = "qhub_family_child_session";
export const CHILD_PAIRING_STORAGE_KEY = "qhub_family_child_pairing";
/** @deprecated use PARENT_SESSION_STORAGE_KEY or CHILD_SESSION_STORAGE_KEY */
export const SESSION_STORAGE_KEY = PARENT_SESSION_STORAGE_KEY;
export const MESSENGER_ROOM_KEY_PREFIX = "qhub_family_messenger_room_key:";

export const POLL_VISIBLE_MS = 2000;
export const POLL_HIDDEN_MS = 12000;
export const GEO_VISIBLE_MS = 30_000;
export const GEO_HIDDEN_MS = 120_000;
/** Участник считается online, если координаты свежее этого порога */
export const PARTICIPANT_ONLINE_MS = 3 * 60 * 1000;
