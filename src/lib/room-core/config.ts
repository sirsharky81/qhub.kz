import type { RoomCoreServiceConfig } from "./types";

export const SHARE_ROOM_CONFIG: RoomCoreServiceConfig = {
  serviceId: "share",
  redisPrefix: "room-core:share:",
  maxMembers: 2,
  ttlSec: 60 * 60,
  ownerRole: "host",
  memberRole: "guest",
};
