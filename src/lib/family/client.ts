import type { ChildPairingSession, FamilyPollSnapshot, FamilySession } from "./types";
import type { FamilyMemberType } from "./member-types";

import { platformFetch } from "@/lib/platform/api-client";
import { PlatformOfflineQueue } from "@/lib/platform/offlineQueue";

function authHeaders(session: FamilySession): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Family-Member-Id": session.memberId,
    "X-Family-Access-Token": session.accessToken,
  };
}

export async function createFamilyRoomApi(name: string, parentName?: string): Promise<FamilySession> {
  const res = await platformFetch("/api/family/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось создать комнату");
  }
  const data = (await res.json()) as {
    roomId: string;
    roomName: string;
    memberId: string;
    accessToken: string;
    role: FamilySession["role"];
    memberName: string;
  };
  return {
    roomId: data.roomId,
    memberId: data.memberId,
    accessToken: data.accessToken,
    role: data.role,
    name: data.memberName,
    roomName: data.roomName,
  };
}

export async function createChildPairingApi(name: string): Promise<ChildPairingSession & { qrUrl: string }> {
  const res = await platformFetch("/api/family/child/pairing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось создать QR");
  }
  return res.json() as Promise<ChildPairingSession & { qrUrl: string }>;
}

export type PairingPollResult =
  | { status: "pending" }
  | { status: "paired"; session: FamilySession }
  | { status: "expired" };

export async function pollChildPairingApi(pairing: ChildPairingSession): Promise<PairingPollResult> {
  const params = new URLSearchParams({
    token: pairing.pairToken,
    accessToken: pairing.accessToken,
  });
  const res = await platformFetch(`/api/family/child/pairing?${params}`);
  if (res.status === 410) return { status: "expired" };
  if (!res.ok) return { status: "expired" };
  const data = (await res.json()) as
    | { status: "pending" }
    | {
        status: "paired";
        session: {
          roomId: string;
          roomName: string;
          memberId: string;
          accessToken: string;
          name: string;
          parentName: string;
          role: "tracked";
        };
      };
  if (data.status === "paired") {
    return {
      status: "paired",
      session: {
        roomId: data.session.roomId,
        memberId: data.session.memberId,
        accessToken: data.session.accessToken,
        role: "tracked",
        name: data.session.name,
        roomName: data.session.roomName,
        parentName: data.session.parentName,
      },
    };
  }
  return { status: "pending" };
}

export async function adoptChildApi(
  session: FamilySession,
  pairToken: string,
  childName?: string,
  memberType?: FamilyMemberType,
): Promise<{ childName: string; memberId: string }> {
  const res = await platformFetch("/api/family/parent/adopt-child", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ pairToken, childName, memberType }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось добавить ребёнка");
  }
  return res.json() as Promise<{ childName: string; memberId: string }>;
}

export async function postLocationApi(
  session: FamilySession,
  input: { lat: number; lng: number; accuracy: number; battery?: number | null },
): Promise<void> {
  await PlatformOfflineQueue.enqueue({
    type: "location",
    endpoint: "/api/family/location",
    payload: input,
    headers: authHeaders(session),
  });
}

export async function setShareLocationApi(
  session: FamilySession,
  enabled: boolean,
  target: "children" | "parents" = "children",
): Promise<void> {
  const res = await platformFetch("/api/family/member/share-location", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ enabled, target }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось изменить настройку");
  }
}

export async function joinFamilyBindApi(
  token: string,
  name?: string,
): Promise<FamilySession> {
  const res = await platformFetch("/api/family/bind", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, name }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось присоединиться");
  }
  const data = (await res.json()) as {
    roomId: string;
    roomName: string;
    memberId: string;
    accessToken: string;
    role: FamilySession["role"];
    memberName: string;
  };
  return {
    roomId: data.roomId,
    memberId: data.memberId,
    accessToken: data.accessToken,
    role: data.role,
    name: data.memberName,
    roomName: data.roomName,
  };
}

export async function createParentInviteApi(session: FamilySession): Promise<{ bindUrl: string }> {
  const res = await platformFetch(`/api/family/rooms/${encodeURIComponent(session.roomId)}/parent-invite`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось создать приглашение");
  }
  return res.json() as Promise<{ bindUrl: string }>;
}

export async function leaveFamilyApi(session: FamilySession): Promise<void> {
  const res = await platformFetch("/api/family/member/leave", {
    method: "POST",
    headers: authHeaders(session),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось покинуть семью");
  }
}

export async function postSosApi(
  session: FamilySession,
  input: { lat: number; lng: number },
): Promise<void> {
  const res = await platformFetch("/api/family/sos", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось отправить SOS");
  }
}

export async function clearSosApi(session: FamilySession, memberId: string): Promise<void> {
  const res = await platformFetch(`/api/family/sos/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось снять SOS");
  }
}

export async function removeMemberApi(session: FamilySession, memberId: string): Promise<void> {
  const res = await platformFetch(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось удалить участника");
  }
}

export async function deleteFamilyRoomApi(session: FamilySession): Promise<void> {
  const res = await platformFetch(`/api/family/rooms/${encodeURIComponent(session.roomId)}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось удалить семью");
  }
}

export async function updateSosPhoneApi(session: FamilySession, sosPhone: string | null): Promise<void> {
  const res = await platformFetch(`/api/family/rooms/${encodeURIComponent(session.roomId)}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify({ sosPhone }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось сохранить номер");
  }
}

export async function linkMessengerRoomApi(
  session: FamilySession,
  messengerRoomId: string | null,
): Promise<void> {
  const res = await platformFetch(`/api/family/rooms/${encodeURIComponent(session.roomId)}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify({ messengerRoomId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Не удалось привязать мессенджер");
  }
}

export type FamilyPollResult =
  | { snapshot: FamilyPollSnapshot; version: number }
  | { error: "room_gone" };

export async function pollFamilyRoomApi(
  session: FamilySession,
  since: number,
  heartbeat = false,
): Promise<FamilyPollResult | null> {
  const params = new URLSearchParams({
    roomId: session.roomId,
    since: String(since),
  });
  if (heartbeat) params.set("heartbeat", "1");

  const res = await platformFetch(`/api/family/poll?${params}`, {
    headers: {
      "X-Family-Member-Id": session.memberId,
      "X-Family-Access-Token": session.accessToken,
    },
  });

  if (res.status === 410) return { error: "room_gone" };
  if (res.status === 304) return { snapshot: { version: since } as FamilyPollSnapshot, version: since };
  if (!res.ok) return null;

  const data = (await res.json()) as { snapshot: FamilyPollSnapshot; version: number };
  return data;
}

export function buildChildPairQrUrl(pairToken: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
  return `${base}/tools/family/parent/scan?token=${encodeURIComponent(pairToken)}`;
}

export function parseParentScanUrl(url: string): { token: string | null } {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
    return { token: u.searchParams.get("token") };
  } catch {
    return { token: null };
  }
}
