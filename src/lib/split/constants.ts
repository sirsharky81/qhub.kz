export const ROOM_TTL_SEC = 60 * 60 * 24 * 90;
export const MEMBER_TTL_SEC = ROOM_TTL_SEC;
export const INVITE_TTL_SEC = 60 * 60 * 24 * 7;
export const EXPENSE_TTL_SEC = ROOM_TTL_SEC;
export const SETTLEMENT_TTL_SEC = ROOM_TTL_SEC;
export const ASSET_TTL_SEC = ROOM_TTL_SEC;
export const OPERATION_TTL_SEC = ROOM_TTL_SEC;

export const REDIS_ROOM_PREFIX = "split:room:";
export const REDIS_MEMBER_PREFIX = "split:member:";
export const REDIS_INVITE_PREFIX = "split:invite:";
export const REDIS_EXPENSE_PREFIX = "split:expense:";
export const REDIS_EXPENSE_IDS_PREFIX = "split:expense-ids:";
export const REDIS_SETTLEMENT_PREFIX = "split:settlement:";
export const REDIS_SETTLEMENT_IDS_PREFIX = "split:settlement-ids:";
export const REDIS_MUTATION_PREFIX = "split:mutation:";
export const REDIS_ASSET_PREFIX = "split:asset:";
export const REDIS_ASSET_IDS_PREFIX = "split:asset-ids:";
export const REDIS_OP_PREFIX = "split:op:";
export const REDIS_OP_IDS_PREFIX = "split:op-ids:";

export const FORBIDDEN_KEY_PARTS = ["history", "route", "track"] as const;

export const SESSION_STORAGE_KEY = "qhub_split_session";
export const DEVICE_KEY_STORAGE_KEY = "qhub_split_device_key";

export const DEFAULT_CATEGORIES = [
  { id: "food", key: "food", labelRu: "Еда" },
  { id: "transport", key: "transport", labelRu: "Транспорт" },
  { id: "stay", key: "stay", labelRu: "Жильё" },
  { id: "fun", key: "fun", labelRu: "Развлечения" },
  { id: "other", key: "other", labelRu: "Другое" },
] as const;

export const SUPPORTED_CURRENCIES = ["KZT", "USD", "EUR", "RUB", "TRY", "AED"] as const;
