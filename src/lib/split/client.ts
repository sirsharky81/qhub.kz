import { platformFetch } from "@/lib/platform/api-client";
import type {
  DebtSettlement,
  ExpenseParticipantInput,
  Money,
  SplitExpense,
  SplitMethod,
  SplitRoomSnapshot,
  SplitSession,
} from "./types";

function authHeaders(session: SplitSession): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Split-Member-Id": session.memberId,
    "X-Split-Access-Token": session.accessToken,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function apiCreateRoom(input: {
  name?: string;
  ownerName?: string;
  baseCurrency?: string;
}): Promise<SplitSession & { roomName: string; baseCurrency: string }> {
  const res = await platformFetch("/api/split/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    roomId: string;
    roomName: string;
    memberId: string;
    accessToken: string;
    role: "owner";
    displayName: string;
    baseCurrency: string;
  };
  return {
    roomId: data.roomId,
    memberId: data.memberId,
    accessToken: data.accessToken,
    role: data.role,
    displayName: data.displayName,
    roomName: data.roomName,
    baseCurrency: data.baseCurrency,
  };
}

export async function apiCreateInvite(session: SplitSession, channel: "link" | "qr" | "messenger" = "link") {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/invite`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { token: string; expiresAt: number; joinPath: string };
}

export async function apiJoinRoom(input: { token: string; displayName: string }): Promise<SplitSession> {
  const res = await platformFetch("/api/split/rooms/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as SplitSession;
  return data;
}

export async function apiGetSnapshot(session: SplitSession): Promise<SplitRoomSnapshot> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SplitRoomSnapshot;
}

export async function apiSetRates(
  session: SplitSession,
  rates: Array<{ currency: string; rate: Money }>,
): Promise<void> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/rates`, {
    method: "PUT",
    headers: authHeaders(session),
    body: JSON.stringify({ rates }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiCreateExpense(
  session: SplitSession,
  body: {
    description: string;
    amountOriginal: Money;
    currencyOriginal: string;
    categoryId?: string;
    paidByMemberId: string;
    splitMethod: SplitMethod;
    participants: ExpenseParticipantInput[];
    comment?: string;
    clientMutationId?: string;
  },
): Promise<SplitExpense> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/expenses`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SplitExpense;
}

export async function apiDeleteExpense(session: SplitSession, expenseId: string): Promise<void> {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/expenses/${encodeURIComponent(expenseId)}`,
    { method: "DELETE", headers: authHeaders(session) },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiCreateSettlement(
  session: SplitSession,
  body: {
    fromMemberId: string;
    toMemberId: string;
    amountBase: Money;
    comment?: string;
    clientMutationId?: string;
  },
): Promise<DebtSettlement> {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/settlements`,
    {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as DebtSettlement;
}

export async function apiExportCsv(session: SplitSession): Promise<string> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/export`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.text();
}

export async function apiArchiveRoom(session: SplitSession): Promise<void> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/archive`, {
    method: "POST",
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiGetLedger(session: SplitSession) {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/ledger`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function apiCreateAsset(
  session: SplitSession,
  body: { name?: string; currency: string; custodianMemberId?: string; kind?: string },
) {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/assets`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function apiCreateOperation(session: SplitSession, body: Record<string, unknown>) {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/operations`,
    {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
