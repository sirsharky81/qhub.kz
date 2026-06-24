import type { FamilyLocation } from "./types";
import { PARTICIPANT_ONLINE_MS } from "./constants";

export type ParticipantPresence = "online" | "offline" | "not_sharing";

export const PRESENCE_LABELS: Record<ParticipantPresence, string> = {
  online: "online",
  offline: "offline",
  not_sharing: "скрыто",
};

export const PRESENCE_LABELS_LONG: Record<ParticipantPresence, string> = {
  online: "в сети",
  offline: "нет связи",
  not_sharing: "не делится геопозицией",
};

export function getParticipantPresence(
  shareLocationWithParents: boolean,
  location: FamilyLocation | undefined,
  now = Date.now(),
): ParticipantPresence {
  if (!shareLocationWithParents) return "not_sharing";
  if (!location) return "offline";
  if (now - location.updatedAt > PARTICIPANT_ONLINE_MS) return "offline";
  return "online";
}
