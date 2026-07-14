import { createHash, randomBytes } from "crypto";
import { generateRoomCode } from "@/lib/lotto-rooms/codes";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateMemberId(): string {
  return randomBytes(16).toString("hex");
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function generateSplitRoomId(): string {
  return generateRoomCode(6);
}

export function generateEntityId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}
