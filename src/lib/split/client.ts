import { platformFetch } from "@/lib/platform/api-client";
import type {
  DebtSettlement,
  ExpenseParticipantInput,
  Money,
  SplitExpense,
  SplitLedgerResponse,
  SplitMemberPublic,
  SplitMethod,
  SplitRoomSnapshot,
  SplitSession,
} from "./types";
import type { RoomAsset, RoomAssetKind } from "./ledger";
import { getOrCreateSplitDeviceKey } from "./session";

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

export async function apiCreateInvite(
  session: SplitSession,
  channel: "link" | "qr" | "messenger" = "link",
  seatMemberId?: string,
) {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/invite`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ channel, seatMemberId }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as {
    token: string;
    expiresAt: number;
    joinPath: string;
    seatMemberId?: string | null;
  };
}

export async function apiJoinRoom(input: {
  token: string;
  displayName: string;
}): Promise<SplitSession> {
  const res = await platformFetch("/api/split/rooms/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, deviceKey: getOrCreateSplitDeviceKey() }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as SplitSession;
  return data;
}

export async function apiAddLocalParticipant(
  session: SplitSession,
  body: { displayName: string; avatarUrl?: string | null },
): Promise<SplitMemberPublic> {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/participants`,
    { method: "POST", headers: authHeaders(session), body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SplitMemberPublic;
}

export async function apiInviteParticipant(
  session: SplitSession,
  memberId: string,
  channel: "link" | "qr" | "messenger" = "link",
) {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/participants/${encodeURIComponent(memberId)}/invite`,
    { method: "POST", headers: authHeaders(session), body: JSON.stringify({ channel }) },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as {
    token: string;
    expiresAt: number;
    joinPath: string;
    seatMemberId?: string | null;
  };
}

export async function apiTransferOwnership(session: SplitSession, memberId: string): Promise<void> {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/participants/${encodeURIComponent(memberId)}/transfer-ownership`,
    { method: "POST", headers: authHeaders(session), body: "{}" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiWhitelistDevice(
  session: SplitSession,
  memberId: string,
  deviceKey?: string,
): Promise<SplitMemberPublic> {
  const res = await platformFetch(
    `/api/split/rooms/${encodeURIComponent(session.roomId)}/participants/${encodeURIComponent(memberId)}/whitelist`,
    {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ deviceKey: deviceKey || getOrCreateSplitDeviceKey() }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SplitMemberPublic;
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

export async function apiGetLedger(session: SplitSession): Promise<SplitLedgerResponse> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/ledger`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SplitLedgerResponse;
}

export async function apiCreateAsset(
  session: SplitSession,
  body: { name?: string; currency: string; custodianMemberId?: string; kind?: RoomAssetKind },
): Promise<RoomAsset> {
  const res = await platformFetch(`/api/split/rooms/${encodeURIComponent(session.roomId)}/assets`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RoomAsset;
}

export type CreateOperationBody =
  | {
      type: "contribution";
      toAssetId: string;
      amount: Money;
      currency?: string;
      fromMemberId?: string;
      comment?: string;
      clientMutationId?: string;
    }
  | {
      type: "expense_from_asset";
      assetId: string;
      description?: string;
      amountOriginal: Money;
      currencyOriginal: string;
      categoryId?: string;
      splitMethod: SplitMethod;
      participants: ExpenseParticipantInput[];
      comment?: string;
      clientMutationId?: string;
    }
  | {
      type: "withdrawal";
      fromAssetId: string;
      toMemberId: string;
      amount: Money;
      currency?: string;
      comment?: string;
      clientMutationId?: string;
    }
  | {
      type: "transfer";
      fromAssetId: string;
      toAssetId: string;
      amount: Money;
      comment?: string;
      clientMutationId?: string;
    }
  | {
      type: "exchange";
      fromAssetId: string;
      fromAmount: Money;
      toAssetId: string;
      toAmount: Money;
      comment?: string;
      clientMutationId?: string;
    }
  | {
      type: "custody_handoff";
      assetId: string;
      toCustodianMemberId: string;
      comment?: string;
      clientMutationId?: string;
    };

export async function apiCreateOperation(
  session: SplitSession,
  body: CreateOperationBody,
): Promise<unknown> {
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
