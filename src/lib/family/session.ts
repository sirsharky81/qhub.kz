import type { ChildPairingSession, FamilySession } from "./types";
import {
  CHILD_SESSION_STORAGE_KEY,
  CHILD_PAIRING_STORAGE_KEY,
  PARENT_SESSION_STORAGE_KEY,
} from "./constants";

export function saveParentSession(session: FamilySession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PARENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadParentSession(): FamilySession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARENT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FamilySession;
  } catch {
    return null;
  }
}

export function clearParentSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PARENT_SESSION_STORAGE_KEY);
}

export function saveChildSession(session: FamilySession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHILD_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadChildSession(): FamilySession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHILD_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as FamilySession;
    if (!session.roomId) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearChildSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CHILD_SESSION_STORAGE_KEY);
  localStorage.removeItem(CHILD_PAIRING_STORAGE_KEY);
}

export function saveChildPairingSession(session: ChildPairingSession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHILD_PAIRING_STORAGE_KEY, JSON.stringify(session));
}

export function loadChildPairingSession(): ChildPairingSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHILD_PAIRING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChildPairingSession;
  } catch {
    return null;
  }
}

import { clearFamilyCache } from "./coords-db";

export function clearChildPairingSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CHILD_PAIRING_STORAGE_KEY);
}

export function clearAllFamilyLocalData(): void {
  clearParentSession();
  clearChildSession();
  void clearFamilyCache();
}

/** @deprecated */
export function saveFamilySession(session: FamilySession): void {
  if (session.role === "tracked") saveChildSession(session);
  else saveParentSession(session);
}

/** @deprecated */
export function loadFamilySession(): FamilySession | null {
  return loadParentSession() ?? loadChildSession();
}

/** @deprecated */
export function clearFamilySession(): void {
  clearParentSession();
  clearChildSession();
}
