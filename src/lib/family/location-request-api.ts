import type { FamilyLocationRequestMode, FamilySession } from "./types";

export type RequestChildLocationResult =
  | { ok: true; pushSent: number; hasSubscriptions: boolean }
  | { ok: false; error: string; retryAfterSec?: number };

export async function requestChildLocationApi(
  session: FamilySession,
  targetMemberId: string,
  mode: FamilyLocationRequestMode = "notify",
): Promise<RequestChildLocationResult> {
  const res = await fetch("/api/family/location/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Family-Member-Id": session.memberId,
      "X-Family-Access-Token": session.accessToken,
    },
    body: JSON.stringify({ targetMemberId, mode }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    pushSent?: number;
    hasSubscriptions?: boolean;
  };

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    return {
      ok: false,
      error: data.error ?? "Подождите перед повторным запросом",
      retryAfterSec: retryAfter ? Number(retryAfter) : undefined,
    };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "Не удалось отправить запрос" };
  }

  return {
    ok: true,
    pushSent: data.pushSent ?? 0,
    hasSubscriptions: data.hasSubscriptions ?? false,
  };
}
