import { getMessengerSession } from "./session";
import { isPhoneWhitelisted } from "./store";
import { isValidKzPhone, normalizeKzPhone } from "./phone";

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

export function jsonAuthError(err: unknown): Response {
  if (err instanceof MessengerAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
}
