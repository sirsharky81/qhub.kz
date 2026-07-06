import {
  DEFAULT_CALL_TTL_SEC,
  DEFAULT_MAX_DM_ENVELOPES,
  DEFAULT_MAX_ROOM_ENVELOPES,
  DEFAULT_MSG_TTL_HOURS,
  DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  DEFAULT_ROOM_USER_INDEX_TTL_SEC,
  MESSENGER_DIALOG_PREFS_TTL_SEC,
  MESSENGER_MAX_PINNED_DIALOGS,
  MESSENGER_PRESENCE_TTL_SEC,
  MESSENGER_PUSH_TTL_SEC,
} from "./constants";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export interface MessengerHygieneSnapshot {
  generatedAt: number;
  config: {
    messageTtlHours: number;
    roomInactiveTtlHours: number;
    roomUserIndexTtlSec: number;
    maxDmEnvelopes: number;
    maxRoomEnvelopes: number;
    callTtlSec: number;
    presenceTtlSec: number;
    pushSubscriptionTtlDays: number;
    dialogPrefsTtlDays: number;
    maxPinnedDialogs: number;
  };
  warnings: string[];
}

export function getMessengerHygieneSnapshot(): MessengerHygieneSnapshot {
  const messageTtlHours = parsePositiveInt(
    process.env.MESSENGER_MSG_TTL_HOURS,
    DEFAULT_MSG_TTL_HOURS,
  );
  const roomInactiveTtlHours = parsePositiveInt(
    process.env.MESSENGER_ROOM_INACTIVE_TTL_HOURS,
    DEFAULT_ROOM_INACTIVE_TTL_HOURS,
  );
  const maxDmEnvelopes = parsePositiveInt(
    process.env.MESSENGER_MAX_DM_ENVELOPES,
    DEFAULT_MAX_DM_ENVELOPES,
  );
  const maxRoomEnvelopes = parsePositiveInt(
    process.env.MESSENGER_MAX_ROOM_ENVELOPES,
    DEFAULT_MAX_ROOM_ENVELOPES,
  );
  const roomUserIndexTtlSec = parsePositiveInt(
    process.env.MESSENGER_ROOM_USER_INDEX_TTL_SEC,
    DEFAULT_ROOM_USER_INDEX_TTL_SEC,
  );
  const callTtlSec = parsePositiveInt(process.env.MESSENGER_CALL_TTL_SEC, DEFAULT_CALL_TTL_SEC);
  const pushSubscriptionTtlDays = Math.round(MESSENGER_PUSH_TTL_SEC / (60 * 60 * 24));
  const dialogPrefsTtlDays = Math.round(MESSENGER_DIALOG_PREFS_TTL_SEC / (60 * 60 * 24));
  const maxPinnedDialogs = parsePositiveInt(
    process.env.MESSENGER_MAX_PINNED_DIALOGS,
    MESSENGER_MAX_PINNED_DIALOGS,
  );

  const warnings: string[] = [];
  if (messageTtlHours > 72) {
    warnings.push(
      `MESSENGER_MSG_TTL_HOURS=${messageTtlHours}h: для Hobby обычно лучше держать 24-72ч.`,
    );
  }
  if (roomInactiveTtlHours > 6) {
    warnings.push(
      `MESSENGER_ROOM_INACTIVE_TTL_HOURS=${roomInactiveTtlHours}h: можно сократить до 1-6ч.`,
    );
  }
  if (roomUserIndexTtlSec < roomInactiveTtlHours * 3600) {
    warnings.push(
      "MESSENGER_ROOM_USER_INDEX_TTL_SEC меньше TTL комнаты: unread может теряться раньше комнаты.",
    );
  }
  if (maxDmEnvelopes > 4000) {
    warnings.push(
      `MESSENGER_MAX_DM_ENVELOPES=${maxDmEnvelopes}: высокий лимит может раздувать Redis.`,
    );
  }
  if (maxRoomEnvelopes > 8000) {
    warnings.push(
      `MESSENGER_MAX_ROOM_ENVELOPES=${maxRoomEnvelopes}: проверьте необходимость такого объема.`,
    );
  }
  if (callTtlSec > 600) {
    warnings.push(`MESSENGER_CALL_TTL_SEC=${callTtlSec}s: можно снизить до 120-300s.`);
  }
  if (MESSENGER_PUSH_TTL_SEC > 60 * 60 * 24 * 30) {
    warnings.push("TTL push-подписок больше 30 дней, это может накапливать неактивные endpoints.");
  }
  if (dialogPrefsTtlDays > 180) {
    warnings.push("TTL dialog prefs больше 180 дней: проверьте, нужен ли такой срок хранения.");
  }
  if (maxPinnedDialogs > 20) {
    warnings.push("Лимит закрепленных диалогов слишком высокий (>20), лучше держать 5-10.");
  }

  return {
    generatedAt: Date.now(),
    config: {
      messageTtlHours,
      roomInactiveTtlHours,
      roomUserIndexTtlSec,
      maxDmEnvelopes,
      maxRoomEnvelopes,
      callTtlSec,
      presenceTtlSec: MESSENGER_PRESENCE_TTL_SEC,
      pushSubscriptionTtlDays,
      dialogPrefsTtlDays,
      maxPinnedDialogs,
    },
    warnings,
  };
}
