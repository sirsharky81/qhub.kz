export const MESSENGER_SESSION_COOKIE = "qhub_messenger_session";
export const MESSENGER_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export const REDIS_WHITELIST_KEY = "qhub:messenger:whitelist";
export const REDIS_AUTH_PREFIX = "qhub:messenger:auth:";
export const REDIS_PUBKEY_PREFIX = "qhub:messenger:pubkey:";
export const REDIS_DM_PREFIX = "qhub:messenger:dm:";
export const REDIS_DM_USER_INDEX_PREFIX = "qhub:messenger:dm:user:";
export const REDIS_ROOM_USER_INDEX_PREFIX = "qhub:messenger:room:user:";
export const REDIS_DIALOG_PREFS_PREFIX = "qhub:messenger:dialogs:prefs:";
export const REDIS_ROOM_PREFIX = "qhub:messenger:room:";

export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

export const MAX_TEXT_LENGTH = 4000;
export const MAX_PUSH_PREVIEW_LENGTH = 120;
export const MAX_ENCRYPTED_FILE_BYTES = 1024 * 1024; // 1 MB after encryption
export const MAX_RAW_BODY_BYTES = 1.5 * 1024 * 1024;
export const MAX_AUDIO_BLOB_BYTES = 1024 * 1024;
export const MAX_VIDEO_BLOB_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_RAW_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 3 * 60 * 1000;
export const MAX_VIDEO_DURATION_MS = 60 * 1000;
export const MIN_MEDIA_DURATION_MS = 500;

export const DEFAULT_MSG_TTL_HOURS = 48;
export const DEFAULT_ROOM_INACTIVE_TTL_HOURS = 1;
export const DEFAULT_ROOM_USER_INDEX_TTL_SEC = DEFAULT_MSG_TTL_HOURS * 60 * 60;
export const DEFAULT_MAX_DM_ENVELOPES = 2000;
export const DEFAULT_MAX_ROOM_ENVELOPES = 4000;
export const MESSENGER_ROOM_MAX_PARTICIPANTS = 50;
export const MESSENGER_DIALOG_PREFS_TTL_SEC = 60 * 60 * 24 * 120; // 120 days
export const MESSENGER_MAX_PINNED_DIALOGS = 5;
export const HEARTBEAT_STALE_MS = 60 * 1000;
export const ROOM_INACTIVE_MS = DEFAULT_ROOM_INACTIVE_TTL_HOURS * 60 * 60 * 1000;

export const DEVICE_KEY_STORAGE = "qhub_messenger_device_key";
export const SESSION_DIALOGS_KEY = "qhub_messenger_dialogs";
export const LAST_PHONE_STORAGE = "qhub_messenger_last_phone";
export const ROOM_KEY_PREFIX = "qhub_messenger_room_key:";
export const MESSENGER_INSTALL_PROMPT_SHOWN = "qhub_messenger_install_prompt_shown";
export const STORAGE_SALT_KEY = "qhub_messenger_storage_salt";
export const UNREAD_COUNT_KEY = "qhub_messenger_unread";
export const UNREAD_EVENT = "qhub-messenger-unread-change";

export const REDIS_PROFILES_KEY = "qhub:messenger:profiles";
export const REDIS_MESSENGER_PUSH_PREFIX = "qhub:messenger:push:";
export const REDIS_MESSENGER_PRESENCE_PREFIX = "qhub:messenger:presence:";
export const REDIS_MESSENGER_TYPING_PREFIX = "qhub:messenger:typing:";
export const MESSENGER_GLOBAL_PRESENCE_CHANNEL = "__global__";
export const MESSENGER_PUSH_TTL_SEC = 60 * 60 * 24 * 30;
export const MESSENGER_PRESENCE_TTL_SEC = 45;
export const MESSENGER_TYPING_TTL_SEC = 6;
export const MESSENGER_PUSH_PREFS_KEY = "qhub_messenger_push_enabled";
export const MESSENGER_NATIVE_PUSH_TOKEN_KEY = "qhub_messenger_native_push_token";

export const REDIS_CALL_PREFIX = "qhub:messenger:call:";
export const REDIS_CALL_DM_ACTIVE_PREFIX = "qhub:messenger:call:dm:";
export const REDIS_CALL_INCOMING_PREFIX = "qhub:messenger:call:incoming:";
export const DEFAULT_CALL_TTL_SEC = 120;
export const DEFAULT_CALL_RING_TIMEOUT_SEC = 45;
export const DEFAULT_CALL_ICE_TIMEOUT_SEC = 45;
export const DEFAULT_CALL_MAX_SETUP_SEC = 90;
export const MAX_CALL_SIGNALS = 200;
export const CALL_POLL_INTERVAL_MS = 250;
export const CALL_CONNECT_POLL_INTERVAL_MS = 150;
/** Slower poll while waiting for incoming call (home screen / chat idle). */
export const CALL_DISCOVERY_POLL_INTERVAL_MS = 400;
export const CALL_HEARTBEAT_INTERVAL_MS = 30_000;
/** iOS may suspend the tab briefly during notification banners — ping more often while in call. */
export const CALL_HEARTBEAT_ACTIVE_IOS_MS = 10_000;

export const MAX_DISPLAY_NAME_LENGTH = 30;
export const QUOTE_PREVIEW_LENGTH = 80;
export const SENDER_GROUP_MS = 5 * 60 * 1000;
