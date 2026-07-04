import { getMessengerSession } from "./session";
import { isPhoneWhitelisted, getRoomParticipants } from "./store";
import { isValidKzPhone, normalizeKzPhone, peerFromDmChannel } from "./phone";

export const ACCESS_DENIED_MSG = "Доступ недоступен";

export class MessengerAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Whitelist check by phone from login form (no QHub session). */
export async function assertWhitelistedPhone(rawPhone: string): Promise<{ phone: string }> {
  const phone = normalizeKzPhone(rawPhone);
  if (!isValidKzPhone(phone)) {
    throw new MessengerAuthError(ACCESS_DENIED_MSG, 403);
  }
  const allowed = await isPhoneWhitelisted(phone);
  if (!allowed) {
    throw new MessengerAuthError(ACCESS_DENIED_MSG, 403);
  }
  return { phone };
}

export async function assertMessengerSession(): Promise<{ phone: string }> {
  const session = await getMessengerSession();
  if (!session) {
    throw new MessengerAuthError("Требуется вход в мессенджер", 401);
  }
  const phone = normalizeKzPhone(session.phone);
  const allowed = await isPhoneWhitelisted(phone);
  if (!allowed) {
    throw new MessengerAuthError("Доступ запрещён", 403);
  }
  return { phone };
}

/** Channel ACL guard for messenger APIs (poll/send/ack). */
export async function assertChannelParticipant(phone: string, channel: string): Promise<void> {
  const me = normalizeKzPhone(phone);

  if (channel.startsWith("dm:")) {
    const peer = peerFromDmChannel(channel, me);
    if (!peer) {
      throw new MessengerAuthError("Доступ запрещён", 403);
    }
    return;
  }

  if (channel.startsWith("room:")) {
    const roomId = channel.slice(5);
    const participants = await getRoomParticipants(roomId);
    const isMember = participants.some((p) => normalizeKzPhone(p.phone) === me);
    if (!isMember) {
      throw new MessengerAuthError("Доступ запрещён", 403);
    }
    return;
  }

  throw new MessengerAuthError("Неизвестный канал", 400);
}

export function jsonAuthError(err: unknown): Response {
  if (err instanceof MessengerAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
}
