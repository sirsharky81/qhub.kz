import { MESSENGER_SELF_ADDED_BY } from "./constants";
import type { WhitelistEntry, WhitelistStatus } from "./types";

/** Stored `revoked` is the old name for a hard block. */
export function isWhitelistBlocked(status: WhitelistStatus | undefined): boolean {
  return status === "blocked" || status === "revoked";
}

export function isWhitelistActive(status: WhitelistStatus | undefined): boolean {
  return status === "active";
}

export function publicWhitelistStatus(status: WhitelistStatus | undefined): "active" | "blocked" {
  return isWhitelistActive(status) ? "active" : "blocked";
}

export function isMessengerVerified(entry: Pick<WhitelistEntry, "verified" | "addedBy">): boolean {
  if (entry.verified === true) return true;
  return entry.addedBy === MESSENGER_SELF_ADDED_BY;
}

export function messengerOrigin(entry: Pick<WhitelistEntry, "addedBy">): "otp" | "admin" {
  return entry.addedBy === MESSENGER_SELF_ADDED_BY ? "otp" : "admin";
}
